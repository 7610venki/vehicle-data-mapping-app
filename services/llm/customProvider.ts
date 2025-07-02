
import { SupabaseClient } from "@supabase/supabase-js";
import { 
    LlmProvider, 
    LearnedRule, 
    RuleGenerationExample, 
    SemanticBatchTask, 
    WebSearchBatchResult 
} from "../../types";
import { supabaseUrl } from '../supabaseClient';

export class CustomProvider implements LlmProvider {
  private apiKey: string;
  private model: string;
  private supabase: SupabaseClient;

  constructor(apiKey: string, model: string, supabase: SupabaseClient) {
    if (!apiKey || !model) {
      throw new Error("Custom Provider requires API Key and Model.");
    }
    if (!supabase) {
        throw new Error("Custom Provider requires a Supabase client instance.");
    }
    this.apiKey = apiKey;
    this.model = model;
    this.supabase = supabase;
  }
  
  private async makeApiCall(prompt: string): Promise<any> {
    if (!supabaseUrl) {
      throw new Error("Supabase URL is not configured. Cannot contact the proxy Edge Function.");
    }
    const proxyEndpoint = `${supabaseUrl}/functions/v1/proxy-llm`;

    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) {
        throw new Error("User is not authenticated. Cannot call the secure proxy.");
    }
    
    const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'X-Provider-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
            model: this.model,
            prompt: prompt
        }),
    });

    const responseBody = await response.text();
    if (!response.ok) {
        throw new Error(`Proxy API call failed with status ${response.status}: ${responseBody}`);
    }

    try {
        return JSON.parse(responseBody);
    } catch (e) {
        throw new Error(`Failed to parse JSON response from proxy. Response: ${responseBody}`);
    }
  }
  
  async findBestMatchBatch(
    shoryRecords: { id: string; make: string; model: string; }[],
  ): Promise<Map<string, WebSearchBatchResult>> {
    console.warn("findBestMatchBatch (Web Search) is not supported by the CustomProvider and was called.");
    const results = new Map<string, WebSearchBatchResult>();
    shoryRecords.forEach(rec => {
        results.set(rec.id, {
            shoryId: rec.id,
            matchedICMake: null, matchedICModel: null, matchedICCode: null,
            confidence: 0,
            reason: "Web Search layer is not available for custom LLM providers.",
        });
    });
    return Promise.resolve(results);
  }

  async semanticCompareWithLimitedListBatch(
    tasks: SemanticBatchTask[]
  ): Promise<Map<string, { matchedICInternalId: string | null; confidence: number | null; aiReason?: string }>> {
    const results = new Map<string, { matchedICInternalId: string | null; confidence: number | null; aiReason?: string }>();
    if (tasks.length === 0) return results;

    const tasksString = tasks.map((task, taskIndex) => {
      const candidateListString = task.candidates.map((item, index) =>
        `${index + 1}. Make: "${item.originalMake}", Model: "${item.originalModel}"`
      ).join('\n');
      return `--- TASK ${taskIndex + 1} ---\nShory Vehicle ID: "${task.shoryId}"\nShory Vehicle to Match: Make: "${task.shoryMake}", Model: "${task.shoryModel}"\nPotential IC Matches (Choose one or none):\n${candidateListString || "No candidates."}`;
    }).join('\n');

    const prompt = `You are a meticulous vehicle data analyst.
For each task below, you must strictly follow these rules to find the best match for a "Shory" vehicle from its list of "Insurance Company (IC)" candidates.

**Matching Rules:**
1.  **VALIDATE MAKE:** The MAKE of the Shory vehicle and the IC candidate must be semantically identical or a very common abbreviation (e.g., "Mercedes-Benz" and "Mercedes" is OK). If the MAKES are different brands (e.g., "BYD" vs "AUDI"), it is NOT a match, even if the model name is similar.
2.  **COMPARE MODEL:** ONLY if the MAKE is a valid match, you then compare the MODEL for the highest semantic similarity.
3.  **REJECT IF NO MATCH:** If no candidate satisfies BOTH rules, you MUST indicate no match was found. Do not select the "least bad" option.

**Example of what NOT to do (Invalid Match):**
- Shory Vehicle: Make: "BYD", Model: "S6"
- IC Candidate: Make: "AUDI", Model: "S6"
- Correct decision: This is NOT a match because the makes (BYD, AUDI) are completely different.

**Response Format:**
Respond ONLY with a single valid JSON object containing a key "results" which holds an array of objects. Each object in the array corresponds to a task and must have this exact format:
{
  "shoryId": "THE_ORIGINAL_ID_FROM_THE_TASK",
  "chosenICIndex": INDEX_OF_CHOSEN_IC_VEHICLE_FROM_LIST_OR_NULL,
  "confidence": CONFIDENCE_SCORE_0_TO_1_OR_NULL,
  "reason": "ONE_LINE_EXPLANATION of why the choice was made or rejected based on the rules."
}
The chosenICIndex must be the 1-based number from the list for that specific task. If no match, chosenICIndex must be null.

--- TASKS ---\n${tasksString}`;

    try {
      const response = await this.makeApiCall(prompt);
      const parsedArray = response.results;

      if (parsedArray && Array.isArray(parsedArray)) {
        parsedArray.forEach((item: any) => {
          if (item && item.shoryId) {
            const originalTask = tasks.find(t => t.shoryId === item.shoryId);
            if (!originalTask) return;
            
            let matchedICInternalId: string | null = null;
            if (item.chosenICIndex !== null && typeof item.chosenICIndex === 'number') {
              const index = item.chosenICIndex - 1; // 0-based
              if (index >= 0 && index < originalTask.candidates.length) {
                matchedICInternalId = originalTask.candidates[index].internalId;
              }
            }
            results.set(item.shoryId, {
              matchedICInternalId,
              confidence: item.confidence,
              aiReason: item.reason,
            });
          }
        });
      } else {
        throw new Error("The 'results' key was not found or was not an array in the LLM's JSON response.");
      }
    } catch (error) {
      console.error("Error calling Custom LLM API (Semantic Batch):", error);
      tasks.forEach(task => {
        results.set(task.shoryId, { matchedICInternalId: null, confidence: 0, aiReason: `Custom LLM API Error: ${error instanceof Error ? error.message : "Unknown error"}`});
      });
    }
    return results;
  }

  async generateRulesFromMatches(examples: RuleGenerationExample[]): Promise<LearnedRule[]> {
    if (examples.length === 0) return [];
    
    const examplesString = examples.map(e => `- Shory (Make: "${e.shoryMake}", Model: "${e.shoryModel}") => IC (Make: "${e.icMake}", Model: "${e.icModel}")`).join('\n');
    
    const prompt = `You are a data analyst creating a rule-based matching system. Based on the provided list of successful vehicle data matches, generate a set of generic, reusable matching rules. Focus on common patterns, abbreviations, and tokenizations. Create a rule only if you can identify a clear, reusable pattern.

Respond ONLY with a single valid JSON object with a key "rules" which contains an array of rule objects. Each rule object must have this exact structure:
{
  "conditions": [
    { "field": "make" | "model", "operator": "contains" | "equals", "value": "LOWERCASE_STRING" }
  ],
  "actions": { "setMake": "IC_MAKE_VALUE", "setModel": "IC_MODEL_VALUE" }
}

Here are the successful matches to analyze:
${examplesString}`;

    try {
      const response = await this.makeApiCall(prompt);
      const parsedArray = response.rules;

      if (Array.isArray(parsedArray)) {
        return parsedArray.filter(rule => 
            rule && Array.isArray(rule.conditions) && rule.actions && rule.actions.setMake && rule.actions.setModel
        ) as LearnedRule[];
      }
      return [];
    } catch(error) {
      console.error("Error calling Custom LLM API (Rule Generation):", error);
      return [];
    }
  }
}