

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
import { GEMINI_MODEL_TEXT, MAX_IC_RECORDS_FOR_AI_PROMPT } from '../../constants';
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
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Proxy API call for Gemini failed with status ${response.status}: ${responseText}`);
    }

    try {
      return JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Failed to parse JSON response from proxy. Response: ${responseText}`);
    }
  }

  async findBestMatchBatch(
    shoryRecords: { id: string, make: string, model: string }[],
    icMakeModelList: { make: string; model: string; code?: string }[]
  ): Promise<Map<string, WebSearchBatchResult>> {
    const results = new Map<string, WebSearchBatchResult>();
    if (shoryRecords.length === 0) return results;

    const limitedICList = icMakeModelList.slice(0, MAX_IC_RECORDS_FOR_AI_PROMPT);
    const icListString = limitedICList
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

Respond ONLY with a single JSON array, where each object corresponds to a Shory vehicle from the input list. The object must have this exact format:
{
  "shoryId": "THE_ORIGINAL_ID_OF_THE_SHORY_VEHICLE",
  "matchedICMake": "MATCHED_IC_MAKE_OR_NULL",
  "matchedICModel": "MATCHED_IC_MODEL_OR_NULL",
  "matchedICCode": "THE_PRIMARY_CODE_OF_THE_MATCHED_IC_VEHICLE_OR_NULL",
  "confidence": CONFIDENCE_SCORE_0_TO_1_OR_NULL,
  "reason": "ONE_LINE_EXPLANATION"
}
If no confident match is found for a Shory vehicle, set its matched fields to null and confidence to a low value. Provide a reason.

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
    } catch (error) {
      console.error("Error calling Gemini API via proxy (Web Search Batch):", error);
      shoryRecords.forEach(rec => {
        results.set(rec.id, {
          shoryId: rec.id,
          matchedICMake: null, matchedICModel: null, matchedICCode: null, confidence: 0,
          reason: `Gemini API Error: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      });
      if (error instanceof Error) throw error;
    }

    return results;
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
1.  **VALIDATE MAKE:** The MAKE of the Shory vehicle and the IC candidate must be semantically identical or a very common abbreviation (e.g., "Mercedes-Benz" and "Mercedes" is OK). If the MAKES are different brands (e.g., "BYD" vs "AUDI"), it is NOT a match, even if the model name is similar.
2.  **COMPARE MODEL:** ONLY if the MAKE is a valid match, you then compare the MODEL for the highest semantic similarity.
3.  **REJECT IF NO MATCH:** If no candidate satisfies BOTH rules, you MUST indicate no match was found. Do not select the "least bad" option.

**Example of what NOT to do (Invalid Match):**
- Shory Vehicle: Make: "BYD", Model: "S6"
- IC Candidate: Make: "AUDI", Model: "S6"
- Correct decision: This is NOT a match because the makes (BYD, AUDI) are completely different.

**Response Format:**
Respond ONLY with a single JSON array, where each object corresponds to a task. The object must have this exact format:
{
  "shoryId": "THE_ORIGINAL_ID_FROM_THE_TASK",
  "chosenICIndex": INDEX_OF_CHOSEN_IC_VEHICLE_FROM_LIST_OR_NULL,
  "confidence": CONFIDENCE_SCORE_0_TO_1_OR_NULL,
  "reason": "ONE_LINE_EXPLANATION of why the choice was made or rejected based on the rules."
}
The chosenICIndex must be the 1-based number from the list for that specific task. If no match, chosenICIndex must be null.

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
    } catch (error) {
      console.error("Error calling Gemini API via proxy (Semantic Batch):", error);
      tasks.forEach(task => {
        results.set(task.shoryId, {
          matchedICInternalId: null, confidence: 0,
          aiReason: `Gemini API Error: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      });
      if (error instanceof Error) throw error;
    }
    return results;
  }

  async generateRulesFromMatches(examples: RuleGenerationExample[]): Promise<LearnedRule[]> {
    if (examples.length === 0) return [];
    
    const examplesString = examples.map(e => `- Shory (Make: "${e.shoryMake}", Model: "${e.shoryModel}") => IC (Make: "${e.icMake}", Model: "${e.icModel}")`).join('\n');
    
    const prompt = `You are a data analyst creating a rule-based matching system.
Based on the provided list of successful vehicle data matches, generate a set of generic, reusable matching rules.
The rules should be logical and not overly specific to avoid overfitting.
Focus on common patterns, abbreviations, and tokenizations.

RULES:
- A rule must contain one or more conditions.
- A condition checks if a 'make' or 'model' field 'contains' or 'equals' a specific lowercase value.
- Use 'contains' for partial matches and 'equals' for exact matches on normalized text.
- Create a rule only if you can identify a clear, reusable pattern.
- The action part of the rule must use the values from the IC (Insurance Company) side of the example.

Respond ONLY with a single JSON array of rule objects. Each rule object must have this exact structure:
{
  "conditions": [
    { "field": "make" | "model", "operator": "contains" | "equals", "value": "LOWERCASE_STRING" }
  ],
  "actions": { "setMake": "IC_MAKE_VALUE", "setModel": "IC_MODEL_VALUE" }
}

Example Input:
- Shory (Make: "Toyota", Model: "Camry LE") => IC (Make: "TOYOTA", Model: "CAMRY 4D SDN LE")

Example JSON output for the above:
[
  {
    "conditions": [
      { "field": "make", "operator": "equals", "value": "toyota" },
      { "field": "model", "operator": "contains", "value": "camry" },
      { "field": "model", "operator": "contains", "value": "le" }
    ],
    "actions": { "setMake": "TOYOTA", "setModel": "CAMRY 4D SDN LE" }
  }
]

Here are the successful matches to analyze:
${examplesString}
`;
    try {
      const response = await this._makeApiCall(prompt);
      const parsedArray = this.parseJsonArrayResponse(response.text);

      if (Array.isArray(parsedArray)) {
        return parsedArray.filter(rule => 
            rule && Array.isArray(rule.conditions) && rule.actions && rule.actions.setMake && rule.actions.setModel
        ) as LearnedRule[];
      }
      return [];

    } catch(error) {
      console.error("Error calling Gemini API via proxy (Rule Generation):", error);
      if (error instanceof Error) throw error;
      return [];
    }
  }
}