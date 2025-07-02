
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

export class GeminiProvider implements LlmProvider {
  private supabase: SupabaseClient;
  private model = GEMINI_MODEL_TEXT;

  constructor(supabase: SupabaseClient) {
    if (!supabase) throw new Error("GeminiProvider requires a Supabase client instance for secure proxy calls.");
    this.supabase = supabase;
  }
  
  private async _makeApiCall(prompt: string, tools?: any): Promise<GenerateContentResponse> {
    if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
    const proxyEndpoint = `${supabaseUrl}/functions/v1/proxy-llm`;
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("User not authenticated.");

    const body: any = { provider: 'gemini', model: this.model, prompt };
    if (tools) body.tools = tools;
    
    const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy API call for Gemini failed with status ${response.status}: ${errorText}`);
    }
    
    const jsonResponse = await response.json();
    return {
        ...jsonResponse,
        text: jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text || ''
    };
  }

  private _parseJsonResponse(text: string): any {
    let jsonStr = text.trim();
    const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
    const match = jsonStr.match(fenceRegex);
    if (match && match[1]) {
      jsonStr = match[1].trim();
    }
    return JSON.parse(jsonStr);
  }

  async findBestMatchBatch(shoryRecords: { id: string, make: string, model: string }[], icMakeModelList: { make: string; model: string; code?: string }[]): Promise<WebSearchBatchResult[]> {
    if (shoryRecords.length === 0) return [];

    const icListString = icMakeModelList.map(item => `Make: "${item.make}", Model: "${item.model}"${item.code ? `, PrimaryCode: "${item.code}"` : ''}`).join('\n');
    const shoryListString = shoryRecords.map(item => `ID: "${item.id}", Make: "${item.make}", Model: "${item.model}"`).join('\n');

    const prompt = `You are an expert vehicle data mapper. For each Shory vehicle, find the best match from the IC list using web search.
Respond ONLY with a single valid JSON object with a key "results" which holds an array of JSON objects, one for each Shory vehicle.
Each JSON object must have this exact format:
{ "shoryId": "...", "matchedICMake": "...", "matchedICModel": "...", "matchedICCode": "...", "confidence": 0.0-1.0, "reason": "..." }

Shory Vehicles List:
${shoryListString}

Insurance Company (IC) Vehicle List to Match Against:
${icListString}`;
    
    try {
        const response = await this._makeApiCall(prompt, [{googleSearch: {}}]);
        const parsedData = this._parseJsonResponse(response.text);
        const results = parsedData.results;

        if (!Array.isArray(results)) {
          throw new Error("LLM response did not contain a 'results' array.");
        }

        const groundingSources: GroundingSource[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.map((c: any) => c.web)
            .filter((w: any) => w?.uri)
            .map((w: any) => ({ uri: w.uri, title: w.title || w.uri })) || [];
            
        return results.map(r => ({ ...r, groundingSources }));

    } catch (error) {
        console.error("Error in Gemini Web Search Batch:", error);
        return shoryRecords.map(rec => ({ 
            shoryId: rec.id, matchedICMake: null, matchedICModel: null, matchedICCode: null, 
            confidence: 0, reason: `Gemini API Error: ${error instanceof Error ? error.message : "Unknown error"}`
        }));
    }
  }
  
  async semanticCompareWithLimitedListBatch(tasks: SemanticBatchTask[]): Promise<SemanticLLMBatchResult[]> {
    if (tasks.length === 0) return [];

    const tasksString = tasks.map((task, taskIndex) => {
      const candidateListString = task.candidates.map((item, index) => `${index + 1}. Make: "${item.originalMake}", Model: "${item.originalModel}"`).join('\n');
      return `--- TASK ${taskIndex + 1} ---\nShory Vehicle ID: "${task.shoryId}"\nShory Vehicle to Match: Make: "${task.shoryMake}", Model: "${task.shoryModel}"\nPotential IC Matches:\n${candidateListString || "No candidates."}`;
    }).join('\n');

    const prompt = `You are a meticulous vehicle data analyst. For each task, find the best match for a "Shory" vehicle from its "IC" candidates.
**Rules:** 1. MAKES must be semantically identical. 2. If MAKES match, compare MODEL for similarity. 3. If no candidate satisfies BOTH, reject the match.
**Response Format:** Respond ONLY with a single valid JSON object with a key "results" which holds an array of objects, one for each task.
Each object must have this exact format:
{ "shoryId": "...", "chosenICIndex": NUMBER_OR_NULL, "confidence": NUMBER_OR_NULL, "reason": "..." }

--- TASKS ---
${tasksString}`;
    
    try {
        const response = await this._makeApiCall(prompt);
        const parsedData = this._parseJsonResponse(response.text);
        const results = parsedData.results;
        
        if (!Array.isArray(results)) {
            throw new Error("LLM response did not contain a 'results' array.");
        }
        return results;
    } catch (error) {
      console.error("Error in Gemini Semantic Batch:", error);
      return tasks.map(task => ({ 
          shoryId: task.shoryId, chosenICIndex: null, confidence: 0, 
          reason: `Gemini API Error: ${error instanceof Error ? error.message : "Unknown error"}`
      }));
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
        const response = await this._makeApiCall(prompt);
        const parsedData = this._parseJsonResponse(response.text);
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
