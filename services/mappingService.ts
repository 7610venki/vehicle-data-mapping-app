

import {
  ShoryRecord,
  ICRecord,
  MappedRecord,
  MatchStatus,
  ShoryColumnConfig,
  ICColumnConfig,
  LearnedRule,
  LlmProvider,
  SemanticBatchTask,
  RuleGenerationExample,
  KnowledgeBaseEntry,
  RuleStatus,
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { 
  TOP_N_CANDIDATES_FOR_SEMANTIC_LLM,
  SEMANTIC_LLM_BATCH_SIZE,
  AI_WEB_SEARCH_BATCH_SIZE,
  KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD,
  FUZZY_MAKE_SIMILARITY_THRESHOLD,
  MAX_IC_RECORDS_FOR_AI_PROMPT,
} from '../constants';
import { SessionService } from './sessionService';
import { normalizeText, extractBaseModel } from './normalizationService';


declare var Fuse: any; // Loaded from CDN

interface FuzzyMatchResult {
  item: ICRecord; 
  score: number; 
  originalMake: string; 
  originalModel: string;
  originalCodes?: { [key: string]: string };
}

interface BestFuzzyCandidate {
  make?: string;
  model?: string;
  codes?: { [key:string]: string };
  score: number;
  internalId: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Increased delay to avoid API rate limiting errors (e.g., 60 RPM on free tiers means 1 req/sec).
const INTER_BATCH_DELAY_MS = 1100; // Polite delay between AI batches

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

export class MappingService {
  private llmProvider: LlmProvider | null = null;

  constructor(llmProviderInstance?: LlmProvider) {
    if (llmProviderInstance) {
      this.llmProvider = llmProviderInstance;
    }
  }

  private getTopNFuzzyCandidates(
    shoryRecord: ShoryRecord,
    processedIcRecords: ICRecord[],
    icConfig: ICColumnConfig,
    count: number
  ): BestFuzzyCandidate[] {
    if (!shoryRecord.__shoryMake || !shoryRecord.__shoryBaseModel) return [];

    // Find IC records with the exact same make
    const icRecordsWithSameMake = processedIcRecords.filter(r => r.__icMake === shoryRecord.__shoryMake);
    if(icRecordsWithSameMake.length === 0) return [];

    // Fuzzy search on the base model within this subset
    const modelFuzzyMatcher = new Fuse(icRecordsWithSameMake.filter(r => r.__icBaseModel), { 
        keys: ['__icBaseModel'], 
        includeScore: true, 
        threshold: 0.9 // Be lenient here to get candidates
    });
    
    const modelMatches: { item: ICRecord, score: number }[] = modelFuzzyMatcher
      .search(shoryRecord.__shoryBaseModel)
      .map((res: any) => ({ item: res.item, score: 1 - res.score }));

    const candidates: BestFuzzyCandidate[] = modelMatches.map(match => ({
        make: match.item[icConfig.make] as string,
        model: match.item[icConfig.model] as string,
        codes: match.item.__icCodes,
        score: parseFloat(match.score.toFixed(2)),
        internalId: match.item.__id,
    }));
    
    const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.internalId, c])).values());
    return uniqueCandidates.sort((a, b) => b.score - a.score).slice(0, count);
  }
  
  private applyRule(record: ShoryRecord, rule: LearnedRule): boolean {
    return rule.conditions.every(cond => {
        // Rules operate on the normalized full model, which is more flexible for keyword matching
        const textToTest = cond.field === 'make' ? record.__shoryMake : record.__shoryModel;
        if (!textToTest) return false;
        
        switch (cond.operator) {
            case 'contains':
                return textToTest.includes(cond.value);
            case 'equals':
                return textToTest === cond.value;
            default:
                return false;
        }
    });
  }

  public async mapData(
    shoryRecords: ShoryRecord[],
    icRecords: ICRecord[],
    shoryConfig: ShoryColumnConfig,
    icConfig: ICColumnConfig,
    fuzzyThreshold: number,
    useKnowledgeBaseLayer: boolean,
    useLearnedRulesLayer: boolean,
    useFuzzyLayer: boolean,
    useAdvancedAiLayer: boolean,
    knowledgeBase: Map<string, KnowledgeBaseEntry[]>,
    learnedRules: LearnedRule[],
    onProgressUpdate?: (mappedRecord: MappedRecord, currentIndex: number, total: number) => void
  ): Promise<MappedRecord[]> {
    const totalRecords = shoryRecords.length;
    let recordsProcessedCount = 0;

    const processedIcRecords: ICRecord[] = icRecords.map(record => {
      const icMake = normalizeText(record[icConfig.make] as string | number);
      const icModel = normalizeText(record[icConfig.model] as string | number);
      return {
        ...record,
        __icMake: icMake,
        __icModel: icModel,
        __icBaseModel: extractBaseModel(icModel),
        __icCodes: icConfig.codes.reduce((acc, codeCol) => ({ ...acc, [codeCol]: String(record[codeCol] ?? '') }), {}),
      };
    });
    
    const icRecordsByOriginal = new Map(processedIcRecords.map(r => [`${r[icConfig.make] as string}|${r[icConfig.model] as string}`, r]));

    const finalResults: MappedRecord[] = shoryRecords.map(r => {
        const shoryMake = normalizeText(r[shoryConfig.make] as string | number);
        const shoryModel = normalizeText(r[shoryConfig.model] as string | number);
        return {
          ...r,
          __shoryMake: shoryMake,
          __shoryModel: shoryModel,
          __shoryBaseModel: extractBaseModel(shoryModel),
          matchStatus: MatchStatus.NOT_PROCESSED,
        };
    });
    
    const findRecordIndexById = (id: string) => finalResults.findIndex(rec => rec.__id === id);

    let recordsToProcessIds = new Set(shoryRecords.map(r => r.__id));

    // Layer -1: Pre-flight data validation
    const invalidPlaceholders = new Set(['', 'null', 'na', 'n/a', '-', 'none']);
    for (const shoryRecord of finalResults) {
        if (!recordsToProcessIds.has(shoryRecord.__id)) continue;

        const isMakeInvalid = !shoryRecord.__shoryMake || invalidPlaceholders.has(shoryRecord.__shoryMake);
        const isModelInvalid = !shoryRecord.__shoryModel || invalidPlaceholders.has(shoryRecord.__shoryModel);

        if (isMakeInvalid || isModelInvalid) {
            shoryRecord.matchStatus = MatchStatus.NO_MATCH;
            shoryRecord.aiReason = `Record could not be processed due to missing or invalid Make/Model. Found Make: '${shoryRecord[shoryConfig.make]}', Model: '${shoryRecord[shoryConfig.model]}'.`;
            recordsToProcessIds.delete(shoryRecord.__id);
            recordsProcessedCount++;
            if (onProgressUpdate) onProgressUpdate(shoryRecord, recordsProcessedCount - 1, totalRecords);
        }
    }

    // Layer 0: Knowledge Base
    if (useKnowledgeBaseLayer && knowledgeBase.size > 0) {
        const icRecordsByNormalizedBase = new Map(processedIcRecords.map(r => [`${r.__icMake}|${r.__icBaseModel}`, r]));
        for (const shoryRecord of finalResults) {
            if (!shoryRecord.__shoryMake || !shoryRecord.__shoryBaseModel || !recordsToProcessIds.has(shoryRecord.__id)) continue;
            
            const knowledgeKey = `${shoryRecord.__shoryMake}|${shoryRecord.__shoryBaseModel}`;
            const knownMatches = knowledgeBase.get(knowledgeKey); // This is now KnowledgeBaseEntry[]
            
            if (knownMatches && knownMatches.length > 0) {
                // Get all potential IC records from the knowledge base matches.
                const candidateIcRecords = knownMatches.map(knownMatch => {
                    return icRecordsByNormalizedBase.get(`${knownMatch.icMake}|${knownMatch.icModel}`);
                }).filter((r): r is ICRecord => r !== undefined);

                if (candidateIcRecords.length > 0) {
                    // If only one candidate, it's a direct match.
                    let bestIcRecord = candidateIcRecords[0];

                    // If multiple candidates, fuzzy match the *full* shory model against the candidates' *full* models.
                    if (candidateIcRecords.length > 1) {
                        const fuzzyMatcher = new Fuse(candidateIcRecords, {
                            keys: ['__icModel'], // Match against the full normalized model
                            includeScore: true,
                            threshold: 1.0 // match against all
                        });
                        
                        const searchResults = fuzzyMatcher.search(shoryRecord.__shoryModel!); // Use full shory model
                        
                        if (searchResults.length > 0) {
                            const bestMatch = searchResults.sort((a,b) => a.score - b.score)[0]; // Fuse score: 0 is perfect match
                            bestIcRecord = bestMatch.item;
                        }
                    }

                    shoryRecord.matchStatus = MatchStatus.MATCHED_KNOWLEDGE;
                    shoryRecord.matchedICMake = bestIcRecord[icConfig.make] as string;
                    shoryRecord.matchedICModel = bestIcRecord[icConfig.model] as string;
                    shoryRecord.matchedICCodes = bestIcRecord.__icCodes;
                    shoryRecord.matchConfidence = 1; // 100% confidence from knowledge base
                    shoryRecord.aiReason = candidateIcRecords.length > 1 ? "Best fuzzy match from multiple historical options." : "Matched from historical knowledge base.";
                    recordsToProcessIds.delete(shoryRecord.__id);
                    recordsProcessedCount++;
                    if (onProgressUpdate) onProgressUpdate(shoryRecord, recordsProcessedCount - 1, totalRecords);
                }
            }
        }
    }
    
    // Layer 1: Learned Rules (with ambiguity check)
    if (useLearnedRulesLayer && learnedRules.length > 0 && recordsToProcessIds.size > 0) {
        for (const shoryRecord of finalResults) {
            if (!recordsToProcessIds.has(shoryRecord.__id)) continue;

            const matchingRules = learnedRules.filter(rule => this.applyRule(shoryRecord, rule));

            if (matchingRules.length === 1) {
                const rule = matchingRules[0];
                const icRecord = icRecordsByOriginal.get(`${rule.actions.setMake}|${rule.actions.setModel}`);
                if (icRecord) {
                    shoryRecord.matchStatus = MatchStatus.MATCHED_RULE;
                    shoryRecord.matchedICMake = icRecord[icConfig.make] as string;
                    shoryRecord.matchedICModel = icRecord[icConfig.model] as string;
                    shoryRecord.matchedICCodes = icRecord.__icCodes;
                    shoryRecord.matchConfidence = 1;
                    shoryRecord.aiReason = "Matched by AI-generated rule.";
                    recordsToProcessIds.delete(shoryRecord.__id);
                    recordsProcessedCount++;
                    if (onProgressUpdate) onProgressUpdate(shoryRecord, recordsProcessedCount - 1, totalRecords);
                }
            } else if (matchingRules.length > 1) {
                // Ambiguous match, let it fall through to the next layer
                shoryRecord.aiReason = `Ambiguous match: ${matchingRules.length} learned rules apply. Passing to next layer.`;
            }
        }
    }

    // Layer 2: Fuzzy Matching (with fuzzy make typo handling)
    if (useFuzzyLayer && recordsToProcessIds.size > 0) {
        const makeFuzzyMatcher = new Fuse(processedIcRecords, { keys: ['__icMake'], includeScore: true, threshold: 1 - FUZZY_MAKE_SIMILARITY_THRESHOLD });
        for (const shoryRecord of finalResults) {
            if (!shoryRecord.__shoryMake || !shoryRecord.__shoryBaseModel || !recordsToProcessIds.has(shoryRecord.__id)) continue;
            
            // Calculate best possible fuzzy score for reporting, regardless of layer logic
            const allFuzzyCandidates = this.getTopNFuzzyCandidates(shoryRecord, processedIcRecords, icConfig, 1);
            shoryRecord.actualFuzzyScore = allFuzzyCandidates.length > 0 ? allFuzzyCandidates[0].score : 0;

            let icRecordsForModelMatch = processedIcRecords.filter(r => r.__icMake === shoryRecord.__shoryMake);
            let reasonForFuzzyMatch = "Matched by exact make and fuzzy base model.";
            
            // --- NEW: Handle Make Typos ---
            if (icRecordsForModelMatch.length === 0) {
                const makeMatches = makeFuzzyMatcher.search(shoryRecord.__shoryMake!);
                if (makeMatches.length > 0) {
                    const bestMakeMatch = makeMatches[0];
                    const matchedMake = bestMakeMatch.item.__icMake;
                    icRecordsForModelMatch = processedIcRecords.filter(r => r.__icMake === matchedMake);
                    reasonForFuzzyMatch = `Matched by fuzzy make ('${shoryRecord.__shoryMake}' -> '${matchedMake}') and fuzzy base model.`;
                }
            }

            if (icRecordsForModelMatch.length > 0) {
                const modelFuzzyMatcher = new Fuse(icRecordsForModelMatch.filter(r => r.__icBaseModel), { 
                    keys: ['__icBaseModel'], 
                    includeScore: true, 
                    threshold: 1 - fuzzyThreshold // Fuse threshold is 0=perfect, 1=everything
                });
                const modelMatches: FuzzyMatchResult[] = modelFuzzyMatcher.search(shoryRecord.__shoryBaseModel)
                    .map((res: any) => ({ 
                        item: res.item, 
                        score: 1 - res.score, 
                        originalMake: res.item[icConfig.make] as string, 
                        originalModel: res.item[icConfig.model] as string, 
                        originalCodes: res.item.__icCodes 
                    }));

                if (modelMatches.length > 0) {
                    const bestModelMatch = modelMatches.sort((a,b) => b.score - a.score)[0];
                    shoryRecord.matchStatus = MatchStatus.MATCHED_FUZZY;
                    shoryRecord.matchedICMake = bestModelMatch.originalMake;
                    shoryRecord.matchedICModel = bestModelMatch.originalModel;
                    shoryRecord.matchedICCodes = bestModelMatch.originalCodes;
                    shoryRecord.matchConfidence = bestModelMatch.score;
                    shoryRecord.aiReason = reasonForFuzzyMatch;
                    recordsToProcessIds.delete(shoryRecord.__id);
                }
            }
            
            if (onProgressUpdate && !recordsToProcessIds.has(shoryRecord.__id)) {
                recordsProcessedCount++;
                onProgressUpdate(shoryRecord, recordsProcessedCount -1, totalRecords);
            }
        }
    }

    // Layer 3: Advanced AI Matching (with "Second Chance" Web Search)
    if (useAdvancedAiLayer && this.llmProvider && recordsToProcessIds.size > 0) {
        const semanticTasks: SemanticBatchTask[] = [];
        let webSearchTasks: MappedRecord[] = [];

        finalResults.forEach(rec => {
            if (recordsToProcessIds.has(rec.__id) && rec.__shoryMake && rec.__shoryModel) {
                const candidates = this.getTopNFuzzyCandidates(rec, processedIcRecords, icConfig, TOP_N_CANDIDATES_FOR_SEMANTIC_LLM);
                if (candidates.length > 0) rec.allSemanticMatches = candidates.map(c => c.model!);
                
                if (candidates.length > 0) {
                    semanticTasks.push({ shoryId: rec.__id, shoryMake: rec[shoryConfig.make] as string, shoryModel: rec[shoryConfig.model] as string, candidates: candidates.map(c => ({ originalMake: c.make!, originalModel: c.model!, originalCodes: c.codes, primaryCodeValue: (icConfig.codes?.[0] && c.codes) ? c.codes[icConfig.codes[0]] : undefined, internalId: c.internalId })) });
                } else if ('findBestMatchBatch' in this.llmProvider!) {
                    webSearchTasks.push(rec);
                }
            }
        });
        
        const semanticFailuresToRetry: MappedRecord[] = [];
        const semanticBatches = chunk(semanticTasks, SEMANTIC_LLM_BATCH_SIZE);
        for (const [index, batch] of semanticBatches.entries()) {
            batch.forEach(task => {
                const recordIndex = findRecordIndexById(task.shoryId);
                if (recordIndex > -1) {
                    finalResults[recordIndex].matchStatus = MatchStatus.PROCESSING_SEMANTIC_LLM;
                    finalResults[recordIndex].aiReason = "AI semantic processing...";
                    if (onProgressUpdate) onProgressUpdate(finalResults[recordIndex], recordsProcessedCount - 1, totalRecords);
                }
            });

            const batchResults = await this.llmProvider.semanticCompareWithLimitedListBatch(batch);
            
            for (const [shoryId, result] of batchResults.entries()) {
                const recordIndex = findRecordIndexById(shoryId);
                if (recordIndex === -1) continue;

                finalResults[recordIndex].aiReason = result.aiReason;
                if (result.matchedICInternalId && (result.confidence === null || result.confidence >= 0.5)) {
                    const chosenICRecord = processedIcRecords.find(r => r.__id === result.matchedICInternalId);
                    if (chosenICRecord) {
                        finalResults[recordIndex].matchedICMake = chosenICRecord[icConfig.make] as string;
                        finalResults[recordIndex].matchedICModel = chosenICRecord[icConfig.model] as string;
                        finalResults[recordIndex].matchedICCodes = chosenICRecord.__icCodes;
                        finalResults[recordIndex].matchStatus = MatchStatus.MATCHED_SEMANTIC_LLM;
                        finalResults[recordIndex].matchConfidence = result.confidence !== null ? parseFloat(result.confidence.toFixed(2)) : undefined;
                        
                        // Record is finalized.
                        recordsToProcessIds.delete(shoryId);
                        recordsProcessedCount++;
                        if (onProgressUpdate) onProgressUpdate(finalResults[recordIndex], recordsProcessedCount - 1, totalRecords);

                    } else {
                         finalResults[recordIndex].matchStatus = MatchStatus.ERROR_AI;
                         finalResults[recordIndex].aiReason = "Semantic AI chose an ID not found. " + (result.aiReason || "");
                         
                         // Record is finalized (with error).
                         recordsToProcessIds.delete(shoryId);
                         recordsProcessedCount++;
                         if (onProgressUpdate) onProgressUpdate(finalResults[recordIndex], recordsProcessedCount - 1, totalRecords);
                    }
                } else {
                    // This is not a final state. Escalate to web search. DO NOT count progress.
                    semanticFailuresToRetry.push(finalResults[recordIndex]);
                    finalResults[recordIndex].aiReason = "Semantic AI found no match; escalating to web search. " + (result.aiReason || "");
                    if (onProgressUpdate) onProgressUpdate(finalResults[recordIndex], recordsProcessedCount - 1, totalRecords);
                }
            }
            if (index < semanticBatches.length - 1) { // Don't wait after the last batch
                await delay(INTER_BATCH_DELAY_MS);
            }
        }

        const allWebSearchTasks = [...webSearchTasks, ...semanticFailuresToRetry];
        const webSearchBatches = chunk(allWebSearchTasks, AI_WEB_SEARCH_BATCH_SIZE);
        for (const [index, batch] of webSearchBatches.entries()) {
             batch.forEach(rec => {
                const recordIndex = findRecordIndexById(rec.__id);
                if (recordIndex > -1) {
                    finalResults[recordIndex].matchStatus = MatchStatus.PROCESSING_AI;
                    finalResults[recordIndex].aiReason = "AI (web search) processing...";
                    if (onProgressUpdate) onProgressUpdate(finalResults[recordIndex], recordsProcessedCount - 1, totalRecords);
                }
            });
            const uniqueMakesInBatch = [...new Set(batch.map(r => r.__shoryMake).filter((m): m is string => !!m))];
            const relevantIcRecords = processedIcRecords.filter(icRec => uniqueMakesInBatch.includes(icRec.__icMake!));
            let icListForPrompt = relevantIcRecords.length > 0 ? relevantIcRecords : processedIcRecords;

            let contextWasLimited = false;
            if (icListForPrompt.length > MAX_IC_RECORDS_FOR_AI_PROMPT) {
                icListForPrompt = icListForPrompt.slice(0, MAX_IC_RECORDS_FOR_AI_PROMPT);
                contextWasLimited = true;
            }

            const batchResults = await this.llmProvider.findBestMatchBatch(
                batch.map(r => ({ id: r.__id, make: r[shoryConfig.make] as string, model: r[shoryConfig.model] as string })),
                icListForPrompt.map(r => ({ make: r[icConfig.make] as string, model: r[icConfig.model] as string, code: (icConfig.codes?.[0] && r.__icCodes) ? r.__icCodes[icConfig.codes[0]] : undefined}))
            );

            for (const [shoryId, result] of batchResults.entries()) {
                const recordIndex = findRecordIndexById(shoryId);
                if (recordIndex === -1) continue;
                
                let finalReason = result.reason;
                if (contextWasLimited) {
                    finalReason += ` (Note: Context limited to the first ${MAX_IC_RECORDS_FOR_AI_PROMPT} potential IC matches to prevent timeouts.)`;
                }
                finalResults[recordIndex].aiReason = finalReason;
                
                if (result.groundingSources) {
                    finalResults[recordIndex].groundingSources = result.groundingSources;
                }
                
                // This is the final AI layer. The record is considered "processed" here.
                // We will finalize its state now.
                recordsToProcessIds.delete(shoryId);
                recordsProcessedCount++;

                if (result.matchedICMake && result.matchedICModel && (result.confidence === null || result.confidence >= 0.5)) {
                    const originalIC = icRecordsByOriginal.get(`${result.matchedICMake}|${result.matchedICModel}`);
                    if(originalIC){
                        finalResults[recordIndex].matchedICMake = originalIC[icConfig.make] as string;
                        finalResults[recordIndex].matchedICModel = originalIC[icConfig.model] as string;
                        finalResults[recordIndex].matchedICCodes = originalIC.__icCodes;
                    } else { 
                        finalResults[recordIndex].matchedICMake = result.matchedICMake;
                        finalResults[recordIndex].matchedICModel = result.matchedICModel;
                        if(result.matchedICCode && icConfig.codes.length > 0) finalResults[recordIndex].matchedICCodes = {[icConfig.codes[0]]: result.matchedICCode};
                    }
                    finalResults[recordIndex].matchStatus = MatchStatus.MATCHED_AI;
                    finalResults[recordIndex].matchConfidence = result.confidence !== null ? parseFloat(result.confidence.toFixed(2)) : undefined;
                } else {
                    // If no match from the AI, it's a definitive No Match.
                    finalResults[recordIndex].matchStatus = MatchStatus.NO_MATCH;
                }
                if (onProgressUpdate) onProgressUpdate(finalResults[recordIndex], recordsProcessedCount -1, totalRecords);
            }
            if (index < webSearchBatches.length - 1) { // Don't wait after the last batch
                await delay(INTER_BATCH_DELAY_MS);
            }
        }
    }

    // Finalization: Mark any remaining as NO_MATCH
    recordsToProcessIds.forEach(id => {
      const recordIndex = findRecordIndexById(id);
      if (recordIndex > -1) {
        const rec = finalResults[recordIndex];
        rec.matchStatus = MatchStatus.NO_MATCH;
        if (!rec.aiReason) {
            let enabledLayers = [];
            if(useKnowledgeBaseLayer) enabledLayers.push("Knowledge Base");
            if(useLearnedRulesLayer) enabledLayers.push("Learned Rules");
            if(useFuzzyLayer) enabledLayers.push("Fuzzy");
            if(useAdvancedAiLayer) enabledLayers.push("Advanced AI");
            rec.aiReason = `No match found by enabled layers: ${enabledLayers.join(', ') || 'None'}.`;
        }
        // This is the final step for these records. Count them now.
        if (recordsProcessedCount < totalRecords) {
          recordsProcessedCount++;
          if (onProgressUpdate) onProgressUpdate(rec, recordsProcessedCount - 1, totalRecords);
        }
      }
    });

    return finalResults;
  }
  
  private validateAndFilterGeneratedRules(
    rules: LearnedRule[],
    examples: RuleGenerationExample[]
  ): LearnedRule[] {
    const MIN_CONDITION_VALUE_LENGTH = 2;
    const MODEL_SIMILARITY_THRESHOLD = 0.7; // Stricter threshold for rule safety
  
    const fuzzyMatcher = new Fuse([], { keys: ['model'], includeScore: true });
  
    return rules.filter(rule => {
      // 1. Basic Sanity Check
      if (!rule.conditions || rule.conditions.length === 0 || !rule.actions) {
        return false;
      }
  
      // 2. Prevent Overly Generic Rules
      const isTooGeneric = rule.conditions.some(
        c => c.value.length < MIN_CONDITION_VALUE_LENGTH
      );
      if (isTooGeneric) {
        return false;
      }
  
      // 3. Model Similarity Check (The most important check)
      // Find the original example that likely spawned this rule
      const potentialExample = examples.find(
        ex =>
          ex.icMake === rule.actions.setMake &&
          ex.icModel === rule.actions.setModel
      );
  
      if (potentialExample) {
        // Compare the IC model (action) with the Shory model (from the example)
        fuzzyMatcher.setCollection([
          { model: normalizeText(potentialExample.shoryModel) },
        ]);
        const results = fuzzyMatcher.search(normalizeText(rule.actions.setModel));
  
        if (results.length > 0) {
          const score = 1 - results[0].score; // 1 is a perfect match
          // If the score is below the threshold, the models are too different (e.g., F360 vs F430)
          if (score < MODEL_SIMILARITY_THRESHOLD) {
            console.warn(`[Rule Validation] Discarding unsafe rule: Models "${potentialExample.shoryModel}" and "${rule.actions.setModel}" are too dissimilar.`, rule);
            return false;
          }
        }
      }
  
      // If all checks pass, the rule is considered safe
      return true;
    });
  }
  
  public async performLearning(
      mappedRecords: MappedRecord[],
      icConfig: ICColumnConfig,
      llmProvider: LlmProvider,
      sessionService: SessionService,
      layersToLearnFrom: { knowledgeBase: boolean, rules: boolean }
  ): Promise<LearnedRule[]> { // Changed return type
      const highConfidenceMatches = mappedRecords.filter(record => {
          const isHighConfidence =
              (record.matchStatus === MatchStatus.MATCHED_AI && (record.matchConfidence ?? 0) >= KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD) ||
              (record.matchStatus === MatchStatus.MATCHED_SEMANTIC_LLM && (record.matchConfidence ?? 0) >= KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD) ||
              (record.matchStatus === MatchStatus.MATCHED_FUZZY && (record.matchConfidence ?? 0) >= KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD + 0.04);
          return isHighConfidence && record.__shoryMake && record.__shoryBaseModel && record.matchedICMake && record.matchedICModel;
      });

      if (highConfidenceMatches.length === 0) return [];

      // Learn for Knowledge Base
      if (layersToLearnFrom.knowledgeBase) {
          const newKnowledge = new Map<string, KnowledgeBaseEntry[]>();
          highConfidenceMatches.forEach(record => {
              const key = `${record.__shoryMake!}|${record.__shoryBaseModel!}`;
              const icBaseModel = extractBaseModel(normalizeText(record.matchedICModel!));
              const newEntry = {
                  icMake: normalizeText(record.matchedICMake!),
                  icModel: icBaseModel,
              };
              
              const existing = newKnowledge.get(key);
              if (existing) {
                  if (!existing.find(e => e.icMake === newEntry.icMake && e.icModel === newEntry.icModel)) {
                      existing.push(newEntry);
                  }
              } else {
                  newKnowledge.set(key, [newEntry]);
              }
          });
          if (newKnowledge.size > 0) {
              await sessionService.bulkAddToKnowledgeBase(newKnowledge);
          }
      }
      
      let pendingRules: LearnedRule[] = [];
      // Learn for Rule Generation
      if (layersToLearnFrom.rules && llmProvider) {
          const ruleExamples: RuleGenerationExample[] = highConfidenceMatches.map(record => ({
              shoryMake: record.__shoryMake!,
              shoryModel: record.__shoryModel!,
              icMake: record.matchedICMake!,
              icModel: record.matchedICModel!,
          }));
          
          const proposedRules = await llmProvider.generateRulesFromMatches(ruleExamples);
          const safeRules = this.validateAndFilterGeneratedRules(proposedRules, ruleExamples);

          if(safeRules.length > 0) {
              console.log(`[Rule Learning] Generated ${proposedRules.length} rules, kept ${safeRules.length} after validation.`);
              // Don't save, instead, add id and status and prepare to return
              pendingRules = safeRules.map(rule => ({
                  ...rule,
                  id: uuidv4(),
                  status: RuleStatus.PENDING,
              }));
          }
      }
      return pendingRules;
  }
}
