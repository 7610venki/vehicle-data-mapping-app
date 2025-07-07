


import { SupabaseClient } from "@supabase/supabase-js";
import { 
    LlmProvider, 
    LearnedRule, 
    RuleGenerationExample, 
    SemanticBatchTask, 
    SemanticLLMBatchResult, 
    WebSearchBatchResult,
    GroundingSource 
} from "../../types";
import { GEMINI_MODEL_TEXT } from '../../constants';
import { supabaseUrl } from "../supabaseClient";


export class GeminiProvider implements LlmProvider {
  private supabase: SupabaseClient;
  private model = GEMINI_MODEL_TEXT;

  constructor(supabase: SupabaseClient) {
    if (!supabase) {
      throw new Error("GeminiProvider requires a Supabase client instance for secure proxy calls.");
    }
    this.supabase = supabase;
  }
  
  private parseJsonArrayResponse(text: string): any[] | null {
    let originalText = text.trim();
    let textToParse = originalText;

    const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
    const fenceMatch = originalText.match(fenceRegex);

    if (fenceMatch && fenceMatch[1]) {
        textToParse = fenceMatch[1].trim();
    }
    
    try {
        const parsed = JSON.parse(textToParse);
        if (Array.isArray(parsed)) return parsed;

        if (typeof parsed === 'object' && parsed !== null) {
            const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
            if(key) return parsed[key];
        }

    } catch (e) {
        console.warn("Primary JSON array parse failed, attempting recovery...", e);
        const recoveredObjects: any[] = [];
        const objectMatches = textToParse.match(/\{[\s\S]*?\}/g);
        
        if (objectMatches) {
            objectMatches.forEach(objStr => {
                try {
                    const parsedObj = JSON.parse(objStr);
                    recoveredObjects.push(parsedObj);
                } catch (recoveryError) {
                    console.warn("Could not recover a JSON object from string:", objStr);
                }
            });
        }
        
        if (recoveredObjects.length > 0) {
            console.log(`Successfully recovered ${recoveredObjects.length} objects from a malformed array.`);
            return recoveredObjects;
        }
    }
    
    console.error("Failed to parse JSON array response. Original text:", originalText);
    return null;
  }

  private async _makeApiCall(
    prompt: string,
    tools?: any,
    responseMimeType: string = "application/json"
  ): Promise<any> {
    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000; // Start with 1 second
    const timeoutDuration = 60000; // 60-second timeout for AI calls

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

            const body: any = {
                provider: 'gemini',
                model: this.model,
                prompt: prompt,
                responseMimeType: responseMimeType
            };
            if (tools) {
                body.tools = tools;
            }

            const response = await fetch(proxyEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const responseText = await response.text();
            if (!response.ok) {
                 // Create a retryable error for specific server statuses
                if (response.status === 503 || response.status === 429) {
                    throw new Error(`RetryableError: Proxy API call for Gemini failed with status ${response.status}: ${responseText}`);
                }
                // For other errors, fail immediately
                throw new Error(`Proxy API call for Gemini failed with status ${response.status}: ${responseText}`);
            }

            try {
                return JSON.parse(responseText);
            } catch (e) {
                throw new Error(`Failed to parse JSON response from proxy. Response: ${responseText}`);
            }
        } catch (error: any) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                error.message = `RetryableError: Request timed out after ${timeoutDuration / 1000} seconds.`;
            }

            attempt++;
             // Check if it's a retryable error and we haven't exceeded attempts
            if (error.message.startsWith('RetryableError') && attempt < maxRetries) {
                console.warn(`Attempt ${attempt} for Gemini failed. Retrying in ${delay / 1000}s... Error: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                 // Not a retryable error or max retries exceeded, throw to fail the process
                throw error;
            }
        }
    }
    // This should not be reached, but is a fallback
    throw new Error("Exceeded max retries for Gemini API call.");
  }

  async findBestMatchBatch(
    shoryRecords: { id: string, make: string, model: string }[],
    icMakeModelList: { make: string; model: string; code?: string }[]
  ): Promise<Map<string, WebSearchBatchResult>> {
    const results = new Map<string, WebSearchBatchResult>();
    if (shoryRecords.length === 0) return results;

    const icListString = icMakeModelList
      .map((item, index) => `${index + 1}. Make: "${item.make}", Model: "${item.model}"${item.code ? `, PrimaryCode: "${item.code}"` : ''}`)
      .join('\n');
    
    const shoryListString = shoryRecords
      .map(item => `ID: "${item.id}", Make: "${item.make}", Model: "${item.model}"`)
      .join('\n');

    const prompt = `You are an expert vehicle data mapper.
Your task is to match a list of "Shory" vehicles with a vehicle from a single "Insurance Company (IC)" list.
For each Shory vehicle, find the most accurate Make/Model match from the IC list.
Prioritize matching MAKE first, then MODEL. Consider variations, typos, and abbreviations.
Use web search to enhance your knowledge.

**CRITICAL INSTRUCTION: Your ENTIRE output MUST be a single, valid JSON array of objects. NOTHING ELSE. Do not include any text, notes, explanations, or markdown formatting like \`\`\`json. The first character of your response must be '[' and the last must be ']'.**

Each object in the array corresponds to a Shory vehicle from the input list and must have this exact format:
{
  "shoryId": "THE_ORIGINAL_ID_OF_THE_SHORY_VEHICLE",
  "matchedICMake": "MATCHED_IC_MAKE_OR_NULL",
  "matchedICModel": "MATCHED_IC_MODEL_OR_NULL",
  "matchedICCode": "THE_PRIMARY_CODE_OF_THE_MATCHED_IC_VEHICLE_OR_NULL",
  "confidence": CONFIDENCE_SCORE_0_TO_1_OR_NULL,
  "reason": "ONE_LINE_EXPLANATION"
}

- If no confident match is found, set its matched fields to null and confidence to a low value. Provide a reason.
- Example of a "No Match" JSON object:
{
  "shoryId": "some-shory-id-456",
  "matchedICMake": null,
  "matchedICModel": null,
  "matchedICCode": null,
  "confidence": 0.1,
  "reason": "No similar make/model found in the IC list."
}

Shory Vehicles List to Process:
${shoryListString}

Insurance Company (IC) Vehicle List to Match Against:
${icListString}
`;
    
    try {
        const response = await this._makeApiCall(prompt, [{googleSearch: {}}], 'application/json');
        
        const jsonString = response.text;
        const parsedArray = this.parseJsonArrayResponse(jsonString) as WebSearchBatchResult[] | null;
        
        const groundingMetadata = response.groundingMetadata;
        const groundingSources: GroundingSource[] = groundingMetadata?.groundingChunks
            ?.map((chunk: any) => chunk.web)
            .filter((web: any) => web?.uri)
            .map((web: any) => ({ uri: web.uri, title: web.title || web.uri })) || [];

        if (parsedArray) {
            parsedArray.forEach(item => {
            if (item && item.shoryId) {
                item.groundingSources = groundingSources; 
                results.set(item.shoryId, item);
            }
            });
        }
        return results;
    } catch (error) {
      console.error("Error calling Gemini API via proxy (Web Search Batch):", error);
      throw error;
    }
  }
  
  async semanticCompareWithLimitedListBatch(
    tasks: SemanticBatchTask[]
  ): Promise<Map<string, { matchedICInternalId: string | null; confidence: number | null; aiReason?: string }>> {
    const results = new Map<string, { matchedICInternalId: string | null; confidence: number | null; aiReason?: string }>();
    if (tasks.length === 0) return results;

    const tasksString = tasks.map((task, taskIndex) => {
      const candidateListString = task.candidates.map((item, index) => 
        `${index + 1}. Make: "${item.originalMake}", Model: "${item.originalModel}"` +
        (item.primaryCodeValue ? `, PrimaryCode: "${item.primaryCodeValue}"` : '')
      ).join('\n');
      
      return `--- TASK ${taskIndex + 1} ---
Shory Vehicle ID: "${task.shoryId}"
Shory Vehicle to Match: Make: "${task.shoryMake}", Model: "${task.shoryModel}"
Potential IC Matches for this task (Choose one or none):
${candidateListString || "No candidates provided."}
`;
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
**CRITICAL: Respond ONLY with a single valid JSON array, without any surrounding text, explanations, or markdown formatting like \`\`\`json. Your entire response must be the JSON array itself.**

Each object in the array corresponds to a task and must have this exact format:
{
  "shoryId": "THE_ORIGINAL_ID_FROM_THE_TASK",
  "chosenICIndex": INDEX_OF_CHOSEN_IC_VEHICLE_FROM_LIST_OR_NULL,
  "confidence": CONFIDENCE_SCORE_0_TO_1_OR_NULL,
  "reason": "ONE_LINE_EXPLANATION of why the choice was made or rejected based on the rules."
}

- The \`chosenICIndex\` must be the 1-based number from the list for that specific task.
- **If no match is found, \`chosenICIndex\` MUST be \`null\` and confidence should be low (e.g., 0.1).**

**Example of a "No Match" JSON object:**
{
  "shoryId": "some-shory-id-123",
  "chosenICIndex": null,
  "confidence": 0.1,
  "reason": "No candidate had a matching make and model based on the strict rules."
}

--- TASKS ---
${tasksString}
`;
    try {
      const response = await this._makeApiCall(prompt);
      const parsedArray = this.parseJsonArrayResponse(response.text) as SemanticLLMBatchResult[] | null;

      if (parsedArray) {
        parsedArray.forEach(item => {
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
      }
      return results;
    } catch (error) {
      console.error("Error calling Gemini API via proxy (Semantic Batch):", error);
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
**CRITICAL: Respond ONLY with a single valid JSON array of rule objects, without any surrounding text, explanations, or markdown formatting like \`\`\`json. Your entire response must be the JSON array itself.**

Each rule object in the array must have this exact structure:
{
  "conditions": [
    { "field": "make" | "model", "operator": "contains" | "equals", "value": "LOWERCASE_STRING" }
  ],
  "actions": { "setMake": "IC_MAKE_VALUE", "setModel": "IC_MODEL_VALUE" }
}

Here are the successful matches to analyze:
${examplesString}
`;
    try {
      const response = await this._makeApiCall(prompt);
      const parsedArray = this.parseJsonArrayResponse(response.text);

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
      console.error("Error calling Gemini API via proxy (Rule Generation):", error);
      return [];
    }
  }
}
