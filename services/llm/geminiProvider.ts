
import { SupabaseClient } from "@supabase/supabase-js";
import { 
    LlmProvider, 
    LearnedRule, 
    RuleGenerationExample, 
    SemanticBatchTask, 
    SemanticLLMBatchResult, 
    WebSearchBatchResult,
    GroundingSource,
    GenerateContentResponse,
} from "../../types";
import { GEMINI_MODEL_TEXT } from '../../constants';
import { supabaseUrl } from "../supabaseClient";

// Helper to process the stream from the proxy which sends ndjson (newline-delimited JSON)
class NdjsonParser implements TransformStream<Uint8Array, any> {
    readable: ReadableStream<any>;
    writable: WritableStream<Uint8Array>;

    constructor() {
        let buffer = '';
        const decoder = new TextDecoder();
        
        const transformStream = new TransformStream({
            transform(chunk, controller) {
                buffer += decoder.decode(chunk, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? ''; // Keep the last, possibly incomplete, line

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    try {
                        controller.enqueue(JSON.parse(line));
                    } catch (e) {
                        console.error("Failed to parse JSON line from stream:", line, e);
                    }
                }
            },
            flush(controller) {
                // If there's anything left in the buffer when the stream is closing,
                // try to parse it.
                if (buffer.trim()) {
                    try {
                        controller.enqueue(JSON.parse(buffer));
                    } catch (e) {
                        console.error("Failed to parse final JSON chunk from stream:", buffer, e);
                    }
                }
            }
        });

        this.readable = transformStream.readable;
        this.writable = transformStream.writable;
    }
}


export class GeminiProvider implements LlmProvider {
  private supabase: SupabaseClient;
  private model = GEMINI_MODEL_TEXT;

  constructor(supabase: SupabaseClient) {
    if (!supabase) throw new Error("GeminiProvider requires a Supabase client instance for secure proxy calls.");
    this.supabase = supabase;
  }
  
  private async *_makeApiCallStream(prompt: string, tools?: any): AsyncGenerator<GenerateContentResponse, void, undefined> {
    if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
    const proxyEndpoint = `${supabaseUrl}/functions/v1/proxy-llm`;
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("User not authenticated.");

    const body: any = { provider: 'gemini', model: this.model, prompt, stream: true };
    if (tools) body.tools = tools;
    
    const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`Proxy API call for Gemini Stream failed with status ${response.status}: ${errorText}`);
    }

    const stream = response.body.pipeThrough(new NdjsonParser());
    const reader = stream.getReader();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value as GenerateContentResponse;
    }
  }

  private async _parseStreamedJson<T>(stream: AsyncGenerator<GenerateContentResponse, void, undefined>): Promise<T[]> {
    let fullText = '';
    for await (const chunk of stream) {
        fullText += chunk.text;
    }

    // Now parse the newline-delimited JSON from the fully assembled text
    return fullText.trim().split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error("Failed to parse JSON object from final assembled text:", line, e);
          return null;
        }
      })
      .filter((item): item is T => item !== null);
  }

  async *findBestMatchBatch(shoryRecords: { id: string, make: string, model: string }[], icMakeModelList: { make: string; model: string; code?: string }[]): AsyncGenerator<WebSearchBatchResult, void, undefined> {
    if (shoryRecords.length === 0) return;

    const icListString = icMakeModelList.map(item => `Make: "${item.make}", Model: "${item.model}"${item.code ? `, PrimaryCode: "${item.code}"` : ''}`).join('\n');
    const shoryListString = shoryRecords.map(item => `ID: "${item.id}", Make: "${item.make}", Model: "${item.model}"`).join('\n');

    const prompt = `You are an expert vehicle data mapper. For each Shory vehicle, find the best match from the IC list using web search.
Respond ONLY with a stream of newline-delimited JSON objects, one for each Shory vehicle.
Each JSON object must have this exact format:
{ "shoryId": "...", "matchedICMake": "...", "matchedICModel": "...", "matchedICCode": "...", "confidence": 0.0-1.0, "reason": "..." }

Shory Vehicles List:
${shoryListString}

Insurance Company (IC) Vehicle List to Match Against:
${icListString}`;
    
    let groundingSources: GroundingSource[] = [];
    try {
        const stream = this._makeApiCallStream(prompt, [{googleSearch: {}}]);
        let fullText = '';
        for await (const chunk of stream) {
            fullText += chunk.text;
            const sources = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c: any) => c.web).filter((w: any) => w?.uri).map((w: any) => ({ uri: w.uri, title: w.title || w.uri })) || [];
            if(sources.length > 0) groundingSources.push(...sources);
        }

        const uniqueSources = Array.from(new Map(groundingSources.map(s => [s.uri, s])).values());

        const results = fullText.trim().split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                try { return JSON.parse(line) as WebSearchBatchResult; } 
                catch (e) { console.error("Failed to parse web search result line:", line, e); return null; }
            }).filter((item): item is WebSearchBatchResult => item !== null);

        for (const item of results) {
            item.groundingSources = uniqueSources;
            yield item;
        }
    } catch (error) {
        console.error("Error in Gemini Web Search Batch Stream:", error);
        for (const rec of shoryRecords) {
            yield { shoryId: rec.id, matchedICMake: null, matchedICModel: null, matchedICCode: null, confidence: 0, reason: `Gemini Stream Error: ${error instanceof Error ? error.message : "Unknown error"}`};
        }
    }
  }
  
  async *semanticCompareWithLimitedListBatch(tasks: SemanticBatchTask[]): AsyncGenerator<SemanticLLMBatchResult, void, undefined> {
    if (tasks.length === 0) return;

    const tasksString = tasks.map((task, taskIndex) => {
      const candidateListString = task.candidates.map((item, index) => `${index + 1}. Make: "${item.originalMake}", Model: "${item.originalModel}"`).join('\n');
      return `--- TASK ${taskIndex + 1} ---\nShory Vehicle ID: "${task.shoryId}"\nShory Vehicle to Match: Make: "${task.shoryMake}", Model: "${task.shoryModel}"\nPotential IC Matches:\n${candidateListString || "No candidates."}`;
    }).join('\n');

    const prompt = `You are a meticulous vehicle data analyst. For each task, find the best match for a "Shory" vehicle from its "IC" candidates.
**Rules:** 1. MAKES must be semantically identical. 2. If MAKES match, compare MODEL for similarity. 3. If no candidate satisfies BOTH, reject the match.
**Response Format:** Respond ONLY with a stream of newline-delimited JSON objects, one for each task.
Each JSON object must have this exact format:
{ "shoryId": "...", "chosenICIndex": NUMBER_OR_NULL, "confidence": NUMBER_OR_NULL, "reason": "..." }

--- TASKS ---
${tasksString}`;
    
    try {
        const stream = this._makeApiCallStream(prompt);
        const results = await this._parseStreamedJson<SemanticLLMBatchResult>(stream);
        for (const item of results) {
            yield item;
        }
    } catch (error) {
      console.error("Error in Gemini Semantic Batch Stream:", error);
      for (const task of tasks) {
        yield { shoryId: task.shoryId, chosenICIndex: null, confidence: 0, reason: `Gemini Stream Error: ${error instanceof Error ? error.message : "Unknown error"}`};
      }
    }
  }

  async generateRulesFromMatches(examples: RuleGenerationExample[]): Promise<LearnedRule[]> {
    if (examples.length === 0) return [];
    
    const examplesString = examples.map(e => `- Shory (Make: "${e.shoryMake}", Model: "${e.shoryModel}") => IC (Make: "${e.icMake}", Model: "${e.icModel}")`).join('\n');
    
    const prompt = `You are a data analyst. Based on the provided successful matches, generate generic, reusable matching rules.
Respond ONLY with a single JSON array of rule objects. Each object must have this structure:
{ "conditions": [{ "field": "make"|"model", "operator": "contains"|"equals", "value": "lowercase_string" }], "actions": { "setMake": "IC_MAKE_VALUE", "setModel": "IC_MODEL_VALUE" } }
Successful matches:
${examplesString}`;
    try {
        // Rule generation can remain a single, non-streamed call for simplicity.
        const stream = this._makeApiCallStream(prompt);
        let fullText = '';
        for await (const chunk of stream) {
            fullText += chunk.text;
        }

        let jsonStr = fullText.trim();
        const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
        const match = jsonStr.match(fenceRegex);
        if (match && match[1]) jsonStr = match[1].trim();

        const parsedData = JSON.parse(jsonStr);
        const rules = Array.isArray(parsedData) ? parsedData : (parsedData.rules || []);

        if (Array.isArray(rules)) {
          return rules.filter(rule => rule && Array.isArray(rule.conditions) && rule.actions && rule.actions.setMake && rule.actions.setModel) as LearnedRule[];
        }
        return [];
    } catch(error) {
      console.error("Error calling Gemini API (Rule Generation):", error);
      if (error instanceof Error) throw error;
      return [];
    }
  }
}
