
import { SupabaseClient } from "@supabase/supabase-js";
import { 
    LlmProvider, 
    LearnedRule, 
    RuleGenerationExample, 
    SemanticBatchTask,
    SemanticLLMBatchResult,
    WebSearchBatchResult 
} from "../../types";
import { supabaseUrl } from '../supabaseClient';

export class CustomProvider implements LlmProvider {
  private apiKey: string;
  private model: string;
  private supabase: SupabaseClient;

  constructor(apiKey: string, model: string, supabase: SupabaseClient) {
    if (!apiKey || !model) throw new Error("Custom Provider requires API Key and Model.");
    if (!supabase) throw new Error("Custom Provider requires a Supabase client instance.");
    this.apiKey = apiKey;
    this.model = model;
    this.supabase = supabase;
  }
  
  private async makeApiCall(prompt: string): Promise<any> {
    if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
    const proxyEndpoint = `${supabaseUrl}/functions/v1/proxy-llm`;
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("User is not authenticated.");
    
    const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'X-Provider-Api-Key': this.apiKey },
        body: JSON.stringify({ provider: 'custom', model: this.model, prompt: prompt }),
    });

    const responseBody = await response.text();
    if (!response.ok) throw new Error(`Proxy API call for Custom Provider failed with status ${response.status}: ${responseBody}`);
    try { return JSON.parse(responseBody); } 
    catch (e) { throw new Error(`Failed to parse JSON response from proxy. Response: ${responseBody}`); }
  }
  
  async *findBestMatchBatch(shoryRecords: { id: string; make: string; model: string; }[]): AsyncGenerator<WebSearchBatchResult, void, undefined> {
    console.warn("findBestMatchBatch (Web Search) is not supported by the CustomProvider and was called.");
    for(const rec of shoryRecords) {
        yield {
            shoryId: rec.id,
            matchedICMake: null, matchedICModel: null, matchedICCode: null,
            confidence: 0,
            reason: "Web Search layer is not available for custom LLM providers.",
        };
    }
  }

  async *semanticCompareWithLimitedListBatch(tasks: SemanticBatchTask[]): AsyncGenerator<SemanticLLMBatchResult, void, undefined> {
    if (tasks.length === 0) return;

    const tasksString = tasks.map((task, taskIndex) => {
      const candidateListString = task.candidates.map((item, index) => `${index + 1}. Make: "${item.originalMake}", Model: "${item.originalModel}"`).join('\n');
      return `--- TASK ${taskIndex + 1} ---\nShory Vehicle ID: "${task.shoryId}"\nShory Vehicle to Match: Make: "${task.shoryMake}", Model: "${task.shoryModel}"\nPotential IC Matches (Choose one or none):\n${candidateListString || "No candidates."}`;
    }).join('\n');

    const prompt = `You are a meticulous vehicle data analyst. For each task below, find the best match for a "Shory" vehicle from its "Insurance Company (IC)" candidates.
**Rules:** 1. MAKES must be semantically identical. 2. If MAKES match, compare MODEL for similarity. 3. If no candidate satisfies BOTH, reject the match.
**Response Format:** Respond ONLY with a single valid JSON object containing a key "results" which holds an array of objects, one per task. Each object must have this exact format: { "shoryId": "...", "chosenICIndex": NUMBER_OR_NULL, "confidence": NUMBER_OR_NULL, "reason": "..." }
--- TASKS ---\n${tasksString}`;

    try {
      const response = await this.makeApiCall(prompt);
      const parsedArray = response.results;

      if (parsedArray && Array.isArray(parsedArray)) {
        for (const item of parsedArray) {
          if (item && item.shoryId) {
            yield item;
          }
        }
      } else {
        throw new Error("The 'results' key was not found or was not an array in the LLM's JSON response.");
      }
    } catch (error) {
      console.error("Error calling Custom LLM API (Semantic Batch):", error);
      for (const task of tasks) {
        yield { shoryId: task.shoryId, chosenICIndex: null, confidence: 0, reason: `Custom LLM API Error: ${error instanceof Error ? error.message : "Unknown error"}`};
      }
    }
  }

  async generateRulesFromMatches(examples: RuleGenerationExample[]): Promise<LearnedRule[]> {
    if (examples.length === 0) return [];
    
    const examplesString = examples.map(e => `- Shory (Make: "${e.shoryMake}", Model: "${e.shoryModel}") => IC (Make: "${e.icMake}", Model: "${e.icModel}")`).join('\n');
    
    const prompt = `You are a data analyst. Based on the provided successful matches, generate a set of generic, reusable matching rules.
Respond ONLY with a single valid JSON object with a key "rules" which contains an array of rule objects. Each rule object must have this structure:
{ "conditions": [{ "field": "make"|"model", "operator": "contains"|"equals", "value": "lowercase_string" }], "actions": { "setMake": "IC_MAKE", "setModel": "IC_MODEL" } }
Here are the matches:
${examplesString}`;

    try {
      const response = await this.makeApiCall(prompt);
      const parsedArray = response.rules;
      if (Array.isArray(parsedArray)) {
        return parsedArray.filter(rule => rule && Array.isArray(rule.conditions) && rule.actions && rule.actions.setMake && rule.actions.setModel) as LearnedRule[];
      }
      return [];
    } catch(error) {
      console.error("Error calling Custom LLM API (Rule Generation):", error);
      return [];
    }
  }
}
