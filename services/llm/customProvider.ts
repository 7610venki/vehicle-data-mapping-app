


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
    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000; // start with 1 second
    const timeoutDuration = 60000; // 60-second timeout

    while(attempt < maxRetries) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

        try {
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
                    provider: 'custom',
                    model: this.model,
                    prompt: prompt
                }),
                signal: controller.signal, // Add AbortController signal
            });

            clearTimeout(timeoutId); // Clear timeout if fetch succeeds

            const responseBody = await response.text();
            if (!response.ok) {
                // Create a retryable error for specific server statuses
                if (response.status === 503 || response.status === 429) {
                    throw new Error(`RetryableError: Proxy API call for Custom Provider failed with status ${response.status}: ${responseBody}`);
                }
                // For other errors, fail immediately
                throw new Error(`Proxy API call for Custom Provider failed with status ${response.status}: ${responseBody}`);
            }

            try {
                return JSON.parse(responseBody);
            } catch (e) {
                throw new Error(`Failed to parse JSON response from proxy. Response: ${responseBody}`);
            }
        } catch (error: any) {
            clearTimeout(timeoutId); // Ensure timeout is cleared on any error

            // Re-package timeout error as a retryable error
            if (error.name === 'AbortError') {
                error.message = `RetryableError: Request timed out after ${timeoutDuration / 1000} seconds.`;
            }

            attempt++;
            // Check if it's a retryable error and we haven't exceeded attempts
            if (error.message.startsWith('RetryableError') && attempt < maxRetries) {
                console.warn(`Attempt ${attempt} for Custom Provider failed. Retrying in ${delay / 1000}s... Error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                // Not a retryable error or max retries exceeded, throw to fail the process
                throw error;
            }
        }
    }
    // This is a fallback
    throw new Error("Exceeded max retries for Custom Provider API call.");
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
1.  **VALIDATE MAKE:** The MAKE of the Shory vehicle and the IC candidate must be semantically identical or a very common abbreviation (e.g., "Mercedes-Benz" and "Mercedes" is OK). If the MAKES are different brands (e.g., "BYD" vs "AUDI"), it is NOT a match.
2.  **VALIDATE MODEL:** If the MAKE is a valid match, you must strictly validate the MODEL.
    - **Different numbers are NOT a match.** (e.g., "K4000" vs "K3000"; "300ZX" vs "350Z"; "F360" vs "F430").
    - **Different body types or suffixes are NOT a match.** (e.g., "Patrol" vs "Patrol Pick Up"; "308" vs "308 SW").
    - **Different core names are NOT a match.** (e.g., "Charmant" vs "Charade"; "Silver Spur" vs "Silver Spirit").
3.  **REJECT IF NO MATCH:** If no candidate satisfies ALL rules, you MUST indicate no match was found. Do not select the "least bad" option.

**Example of what NOT to do (Invalid Match):**
- Shory Vehicle: Make: "Nissan", Model: "300ZX"
- IC Candidate: Make: "Nissan", Model: "350Z"
- Correct decision: This is NOT a match because the model numbers (300 vs 350) are different.

**Response Format:**
**CRITICAL: Respond ONLY with a single valid JSON object containing a key "results" which holds an array of objects. Do not include any text, explanations, or markdown. Your entire response must be the JSON object itself.**

Each object in the "results" array corresponds to a task and must have this exact format:
{
  "shoryId": "THE_ORIGINAL_ID_FROM_THE_TASK",
  "chosenICIndex": INDEX_OF_CHOSEN_IC_VEHICLE_FROM_LIST_OR_NULL,
  "confidence": CONFIDENCE_SCORE_0_TO_1_OR_NULL,
  "reason": "ONE_LINE_EXPLANATION of why the choice was made or rejected based on the rules."
}

- The chosenICIndex must be the 1-based number from the list for that specific task.
- **If no match is found, \`chosenICIndex\` MUST be \`null\` and confidence should be low (e.g., 0.1).**

**Example of a "No Match" JSON object within the results array:**
{
  "shoryId": "some-shory-id-123",
  "chosenICIndex": null,
  "confidence": 0.1,
  "reason": "No candidate had a matching make and model based on the strict rules."
}

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
      return results;
    } catch (error) {
      console.error("Error calling Custom LLM API (Semantic Batch):", error);
      throw error;
    }
  }

  async generateRulesFromMatches(examples: RuleGenerationExample[]): Promise<LearnedRule[]> {
    if (examples.length === 0) return [];
    
    const examplesString = examples.map(e => `- Shory (Make: "${e.shoryMake}", Model: "${e.shoryModel}") => IC (Make: "${e.icMake}", Model: "${e.icModel}")`).join('\n');
    
    const prompt = `You are a data analyst creating a rule-based matching system. Based on the provided list of successful vehicle data matches, generate a set of **safe, high-quality, reusable** matching rules.

**CRITICAL SAFETY RULES FOR RULE GENERATION:**
1.  **FOCUS ON ABBREVIATIONS & REORDERING ONLY:** Your primary goal is to create rules for common abbreviations (e.g., "merc" -> "mercedes-benz") or reordered words (e.g., "pick up patrol" -> "patrol pickup").
2.  **DO NOT GENERALIZE ACROSS DIFFERENT MODELS:** You MUST NOT create rules that match different models, even if they seem similar.
    - **INVALID:** \`300ZX\` vs \`350Z\` (different numbers).
    - **INVALID:** \`F360\` vs \`F430\` (different numbers).
    - **INVALID:** \`Charmant\` vs \`Charade\` (different core names).
3.  **BE CAUTIOUS WITH SUFFIXES:** A rule should not match a base model to a model with a different body type suffix (e.g., matching "308" to "308 SW" is incorrect).
4.  **CREATE SPECIFIC, NOT GENERAL, RULES:** Conditions should be specific. A rule with a condition like \`"value": "f"\` is too broad and dangerous.

**RESPONSE FORMAT:**
**CRITICAL: Respond ONLY with a single valid JSON object with a key "rules" which contains an array of rule objects. Do not include any text, explanations, or markdown. Your entire response must be the JSON object itself.**

Each rule object in the "rules" array must have this exact structure:
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
        // Basic validation on the returned rules
        return parsedArray.filter(rule => 
            rule && Array.isArray(rule.conditions) && rule.conditions.length > 0 &&
            rule.actions && rule.actions.setMake && rule.actions.setModel &&
            rule.conditions.every((c:any) => c.field && c.operator && typeof c.value === 'string' && c.value.length > 0)
        ) as LearnedRule[];
      }
      return [];
    } catch(error) {
      console.error("Error calling Custom LLM API (Rule Generation):", error);
      return [];
    }
  }
}
