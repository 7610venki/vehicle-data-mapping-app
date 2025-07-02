
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
} from '../types';
import { 
  TOP_N_CANDIDATES_FOR_SEMANTIC_LLM,
  SEMANTIC_LLM_BATCH_SIZE,
  AI_WEB_SEARCH_BATCH_SIZE,
  KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD,
  FUZZY_MAKE_SIMILARITY_THRESHOLD,
} from '../constants';
import { SessionService } from './sessionService';
import { normalizeText, extractBaseModel } from './normalizationService';


declare var Fuse: any; // Loaded from CDN

interface FuzzyMatchResult { item: ICRecord; score: number; originalMake: string; originalModel: string; originalCodes?: { [key: string]: string }; }
interface BestFuzzyCandidate { make?: string; model?: string; codes?: { [key:string]: string }; score: number; internalId: string; }
const chunk = <T>(arr: T[], size: number): T[][] => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export class MappingService {
  private llmProvider: LlmProvider;

  constructor(llmProviderInstance: LlmProvider) {
    this.llmProvider = llmProviderInstance;
  }

  private getTopNFuzzyCandidates(shoryRecord: ShoryRecord, processedIcRecords: ICRecord[], icConfig: ICColumnConfig, count: number): BestFuzzyCandidate[] {
    if (!shoryRecord.__shoryMake || !shoryRecord.__shoryBaseModel) return [];
    const icRecordsWithSameMake = processedIcRecords.filter(r => r.__icMake === shoryRecord.__shoryMake);
    if(icRecordsWithSameMake.length === 0) return [];

    const modelFuzzyMatcher = new Fuse(icRecordsWithSameMake.filter(r => r.__icBaseModel), { keys: ['__icBaseModel'], includeScore: true, threshold: 0.9 });
    const modelMatches: { item: ICRecord, score: number }[] = modelFuzzyMatcher.search(shoryRecord.__shoryBaseModel).map((res: any) => ({ item: res.item, score: 1 - res.score }));
    const candidates: BestFuzzyCandidate[] = modelMatches.map(match => ({ make: match.item[icConfig.make] as string, model: match.item[icConfig.model] as string, codes: match.item.__icCodes, score: parseFloat(match.score.toFixed(2)), internalId: match.item.__id }));
    const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.internalId, c])).values());
    return uniqueCandidates.sort((a, b) => b.score - a.score).slice(0, count);
  }
  
  private applyRule(record: ShoryRecord, rule: LearnedRule): boolean {
    return rule.conditions.every(cond => {
        const textToTest = cond.field === 'make' ? record.__shoryMake : record.__shoryModel;
        if (!textToTest) return false;
        return cond.operator === 'contains' ? textToTest.includes(cond.value) : textToTest === cond.value;
    });
  }

  public async mapData(
    shoryRecords: ShoryRecord[], icRecords: ICRecord[], shoryConfig: ShoryColumnConfig, icConfig: ICColumnConfig, fuzzyThreshold: number,
    useKnowledgeBaseLayer: boolean, useLearnedRulesLayer: boolean, useFuzzyLayer: boolean, useAdvancedAiLayer: boolean,
    knowledgeBase: Map<string, KnowledgeBaseEntry[]>, learnedRules: LearnedRule[],
    onProgressUpdate?: (mappedRecord: MappedRecord, currentIndex: number, total: number) => void
  ): Promise<MappedRecord[]> {
    const totalRecords = shoryRecords.length;
    let recordsProcessedCount = 0;

    const processedIcRecords: ICRecord[] = icRecords.map(record => {
      const icMake = normalizeText(record[icConfig.make] as string);
      const icModel = normalizeText(record[icConfig.model] as string);
      return { ...record, __icMake: icMake, __icModel: icModel, __icBaseModel: extractBaseModel(icModel), __icCodes: icConfig.codes.reduce((acc, codeCol) => ({ ...acc, [codeCol]: String(record[codeCol] ?? '') }), {}) };
    });
    const icRecordsByOriginal = new Map(processedIcRecords.map(r => [`${r[icConfig.make] as string}|${r[icConfig.model] as string}`, r]));

    const finalResults: MappedRecord[] = shoryRecords.map(r => {
        const shoryMake = normalizeText(r[shoryConfig.make] as string);
        const shoryModel = normalizeText(r[shoryConfig.model] as string);
        return { ...r, __shoryMake: shoryMake, __shoryModel: shoryModel, __shoryBaseModel: extractBaseModel(shoryModel), matchStatus: MatchStatus.NOT_PROCESSED };
    });
    const findRecordIndexById = (id: string) => finalResults.findIndex(rec => rec.__id === id);
    let recordsToProcessIds = new Set(shoryRecords.map(r => r.__id));

    // --- Layer 0: Knowledge Base ---
    if (useKnowledgeBaseLayer && knowledgeBase.size > 0) {
        const icRecordsByNormalizedBase = new Map(processedIcRecords.map(r => [`${r.__icMake}|${r.__icBaseModel}`, r]));
        finalResults.forEach(shoryRecord => {
            if (!shoryRecord.__shoryMake || !shoryRecord.__shoryBaseModel || !recordsToProcessIds.has(shoryRecord.__id)) return;
            const knownMatches = knowledgeBase.get(`${shoryRecord.__shoryMake}|${shoryRecord.__shoryBaseModel}`);
            if (knownMatches?.length > 0) {
                const candidateIcRecords = knownMatches.map(m => icRecordsByNormalizedBase.get(`${m.icMake}|${m.icModel}`)).filter((r): r is ICRecord => !!r);
                if (candidateIcRecords.length > 0) {
                    let bestIcRecord = candidateIcRecords[0];
                    if (candidateIcRecords.length > 1) {
                        const fuzzyMatcher = new Fuse(candidateIcRecords, { keys: ['__icModel'], includeScore: true, threshold: 1.0 });
                        const searchResults = fuzzyMatcher.search(shoryRecord.__shoryModel!);
                        if (searchResults.length > 0) bestIcRecord = searchResults.sort((a,b) => a.score - b.score)[0].item;
                    }
                    Object.assign(shoryRecord, { matchStatus: MatchStatus.MATCHED_KNOWLEDGE, matchedICMake: bestIcRecord[icConfig.make], matchedICModel: bestIcRecord[icConfig.model], matchedICCodes: bestIcRecord.__icCodes, matchConfidence: 1, aiReason: "Matched from historical knowledge." });
                    recordsToProcessIds.delete(shoryRecord.__id);
                    recordsProcessedCount++;
                    onProgressUpdate?.(shoryRecord, recordsProcessedCount - 1, totalRecords);
                }
            }
        });
    }
    
    // --- Layer 1: Learned Rules ---
    if (useLearnedRulesLayer && learnedRules.length > 0 && recordsToProcessIds.size > 0) {
        finalResults.forEach(shoryRecord => {
            if (!recordsToProcessIds.has(shoryRecord.__id)) return;
            const matchingRules = learnedRules.filter(rule => this.applyRule(shoryRecord, rule));
            if (matchingRules.length === 1) {
                const icRecord = icRecordsByOriginal.get(`${matchingRules[0].actions.setMake}|${matchingRules[0].actions.setModel}`);
                if (icRecord) {
                    Object.assign(shoryRecord, { matchStatus: MatchStatus.MATCHED_RULE, matchedICMake: icRecord[icConfig.make], matchedICModel: icRecord[icConfig.model], matchedICCodes: icRecord.__icCodes, matchConfidence: 1, aiReason: "Matched by AI-generated rule." });
                    recordsToProcessIds.delete(shoryRecord.__id);
                    recordsProcessedCount++;
                    onProgressUpdate?.(shoryRecord, recordsProcessedCount - 1, totalRecords);
                }
            } else if (matchingRules.length > 1) {
                shoryRecord.aiReason = `Ambiguous: ${matchingRules.length} rules apply.`;
            }
        });
    }

    // --- Layer 2: Fuzzy Matching ---
    if (useFuzzyLayer && recordsToProcessIds.size > 0) {
        const makeFuzzyMatcher = new Fuse(processedIcRecords, { keys: ['__icMake'], includeScore: true, threshold: 1 - FUZZY_MAKE_SIMILARITY_THRESHOLD });
        finalResults.forEach(shoryRecord => {
            if (!shoryRecord.__shoryMake || !shoryRecord.__shoryBaseModel || !recordsToProcessIds.has(shoryRecord.__id)) return;
            shoryRecord.actualFuzzyScore = this.getTopNFuzzyCandidates(shoryRecord, processedIcRecords, icConfig, 1)[0]?.score || 0;
            let icRecordsForModelMatch = processedIcRecords.filter(r => r.__icMake === shoryRecord.__shoryMake);
            let reason = "Matched by exact make and fuzzy base model.";
            if (icRecordsForModelMatch.length === 0) {
                const makeMatches = makeFuzzyMatcher.search(shoryRecord.__shoryMake!);
                if (makeMatches.length > 0) {
                    const matchedMake = makeMatches[0].item.__icMake;
                    icRecordsForModelMatch = processedIcRecords.filter(r => r.__icMake === matchedMake);
                    reason = `Matched by fuzzy make ('${shoryRecord.__shoryMake}' -> '${matchedMake}') & fuzzy base model.`;
                }
            }
            if (icRecordsForModelMatch.length > 0) {
                const modelFuzzyMatcher = new Fuse(icRecordsForModelMatch.filter(r => r.__icBaseModel), { keys: ['__icBaseModel'], includeScore: true, threshold: 1 - fuzzyThreshold });
                const modelMatches: FuzzyMatchResult[] = modelFuzzyMatcher.search(shoryRecord.__shoryBaseModel).map((res: any) => ({ item: res.item, score: 1 - res.score, originalMake: res.item[icConfig.make] as string, originalModel: res.item[icConfig.model] as string, originalCodes: res.item.__icCodes }));
                if (modelMatches.length > 0) {
                    const best = modelMatches.sort((a,b) => b.score - a.score)[0];
                    Object.assign(shoryRecord, { matchStatus: MatchStatus.MATCHED_FUZZY, matchedICMake: best.originalMake, matchedICModel: best.originalModel, matchedICCodes: best.originalCodes, matchConfidence: best.score, aiReason: reason });
                    recordsToProcessIds.delete(shoryRecord.__id);
                }
            }
            if (onProgressUpdate && !recordsToProcessIds.has(shoryRecord.__id)) {
                recordsProcessedCount++;
                onProgressUpdate(shoryRecord, recordsProcessedCount -1, totalRecords);
            }
        });
    }

    // --- Layer 3: Advanced AI Matching ---
    if (useAdvancedAiLayer && this.llmProvider && recordsToProcessIds.size > 0) {
        const semanticTasks: SemanticBatchTask[] = [];
        let webSearchTasks: MappedRecord[] = [];

        finalResults.forEach(rec => {
            if (recordsToProcessIds.has(rec.__id) && rec.__shoryMake && rec.__shoryModel) {
                const candidates = this.getTopNFuzzyCandidates(rec, processedIcRecords, icConfig, TOP_N_CANDIDATES_FOR_SEMANTIC_LLM);
                if (candidates.length > 0) {
                    rec.allSemanticMatches = candidates.map(c => c.model!);
                    semanticTasks.push({ shoryId: rec.__id, shoryMake: rec[shoryConfig.make] as string, shoryModel: rec[shoryConfig.model] as string, candidates: candidates.map(c => ({ originalMake: c.make!, originalModel: c.model!, originalCodes: c.codes, primaryCodeValue: (icConfig.codes?.[0] && c.codes) ? c.codes[icConfig.codes[0]] : undefined, internalId: c.internalId })) });
                } else if ('findBestMatchBatch' in this.llmProvider!) {
                    webSearchTasks.push(rec);
                }
            }
        });
        
        const semanticFailuresToRetry: MappedRecord[] = [];
        const semanticBatches = chunk(semanticTasks, SEMANTIC_LLM_BATCH_SIZE);
        for (const batch of semanticBatches) {
            batch.forEach(task => { finalResults[findRecordIndexById(task.shoryId)].matchStatus = MatchStatus.PROCESSING_SEMANTIC_LLM; });
            
            const semanticResults = await this.llmProvider.semanticCompareWithLimitedListBatch(batch);

            for (const result of semanticResults) {
                const recordIndex = findRecordIndexById(result.shoryId);
                if (recordIndex === -1) continue;
                finalResults[recordIndex].aiReason = result.reason;
                if (result.chosenICIndex !== null && (result.confidence === null || result.confidence >= 0.5)) {
                    const chosenCandidate = batch.find(t => t.shoryId === result.shoryId)?.candidates[result.chosenICIndex - 1];
                    const chosenICRecord = chosenCandidate ? processedIcRecords.find(r => r.__id === chosenCandidate.internalId) : null;
                    if (chosenICRecord) {
                        Object.assign(finalResults[recordIndex], { matchedICMake: chosenICRecord[icConfig.make], matchedICModel: chosenICRecord[icConfig.model], matchedICCodes: chosenICRecord.__icCodes, matchStatus: MatchStatus.MATCHED_SEMANTIC_LLM, matchConfidence: result.confidence !== null ? parseFloat(result.confidence.toFixed(2)) : undefined });
                        recordsToProcessIds.delete(result.shoryId);
                    } else {
                         Object.assign(finalResults[recordIndex], { matchStatus: MatchStatus.ERROR_AI, aiReason: "Semantic AI chose an invalid index. " + (result.reason || "") });
                    }
                } else {
                    semanticFailuresToRetry.push(finalResults[recordIndex]);
                    finalResults[recordIndex].aiReason = "Semantic AI found no match; escalating. " + (result.reason || "");
                }
                recordsProcessedCount++;
                onProgressUpdate?.(finalResults[recordIndex], recordsProcessedCount - 1, totalRecords);
            }
        }

        const allWebSearchTasks = [...webSearchTasks, ...semanticFailuresToRetry];
        const webSearchBatches = chunk(allWebSearchTasks, AI_WEB_SEARCH_BATCH_SIZE);
        for (const batch of webSearchBatches) {
            batch.forEach(rec => { rec.matchStatus = MatchStatus.PROCESSING_AI; rec.aiReason = "AI (web search) processing..."; });
            const uniqueMakesInBatch = [...new Set(batch.map(r => r.__shoryMake).filter((m): m is string => !!m))];
            const relevantIcRecords = processedIcRecords.filter(icRec => uniqueMakesInBatch.includes(icRec.__icMake!));
            const icListForPrompt = relevantIcRecords.length > 0 ? relevantIcRecords : processedIcRecords;

            const webResults = await this.llmProvider.findBestMatchBatch(batch.map(r => ({ id: r.__id, make: r[shoryConfig.make] as string, model: r[shoryConfig.model] as string })), icListForPrompt.map(r => ({ make: r[icConfig.make] as string, model: r[icConfig.model] as string, code: (icConfig.codes?.[0] && r.__icCodes) ? r.__icCodes[icConfig.codes[0]] : undefined })));
            
            for (const result of webResults) {
                const recordIndex = findRecordIndexById(result.shoryId);
                if (recordIndex === -1) continue;
                
                Object.assign(finalResults[recordIndex], { aiReason: result.reason, groundingSources: result.groundingSources });
                if (result.matchedICMake && result.matchedICModel && (result.confidence === null || result.confidence >= 0.5)) {
                    const originalIC = icRecordsByOriginal.get(`${result.matchedICMake}|${result.matchedICModel}`);
                    if (originalIC) {
                        Object.assign(finalResults[recordIndex], { matchedICMake: originalIC[icConfig.make], matchedICModel: originalIC[icConfig.model], matchedICCodes: originalIC.__icCodes });
                    } else { 
                        Object.assign(finalResults[recordIndex], { matchedICMake: result.matchedICMake, matchedICModel: result.matchedICModel, ...((result.matchedICCode && icConfig.codes.length > 0) && { matchedICCodes: {[icConfig.codes[0]]: result.matchedICCode} }) });
                    }
                    Object.assign(finalResults[recordIndex], { matchStatus: MatchStatus.MATCHED_AI, matchConfidence: result.confidence !== null ? parseFloat(result.confidence.toFixed(2)) : undefined });
                    recordsToProcessIds.delete(result.shoryId);
                }
                recordsProcessedCount++;
                onProgressUpdate?.(finalResults[recordIndex], recordsProcessedCount - 1, totalRecords);
            }
        }
    }

    // --- Finalization ---
    recordsToProcessIds.forEach(id => {
      const rec = finalResults[findRecordIndexById(id)];
      rec.matchStatus = MatchStatus.NO_MATCH;
      if (!rec.aiReason) rec.aiReason = `No match found by enabled layers.`;
      if (onProgressUpdate && recordsProcessedCount < totalRecords) {
        recordsProcessedCount++;
        onProgressUpdate(rec, recordsProcessedCount - 1, totalRecords);
      }
    });

    return finalResults;
  }
  
  public async performLearning(mappedRecords: MappedRecord[], icConfig: ICColumnConfig, llmProvider: LlmProvider, sessionService: SessionService, layersToLearnFrom: { knowledgeBase: boolean, rules: boolean }) {
      const highConfidenceMatches = mappedRecords.filter(r => (
          (r.matchStatus === MatchStatus.MATCHED_AI && (r.matchConfidence ?? 0) >= KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD) ||
          (r.matchStatus === MatchStatus.MATCHED_SEMANTIC_LLM && (r.matchConfidence ?? 0) >= KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD) ||
          (r.matchStatus === MatchStatus.MATCHED_FUZZY && (r.matchConfidence ?? 0) >= KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD + 0.04))
          && r.__shoryMake && r.__shoryBaseModel && r.matchedICMake && r.matchedICModel
      );
      if (highConfidenceMatches.length === 0) return;

      if (layersToLearnFrom.knowledgeBase) {
          const newKnowledge = new Map<string, KnowledgeBaseEntry[]>();
          highConfidenceMatches.forEach(r => {
              const key = `${r.__shoryMake!}|${r.__shoryBaseModel!}`;
              const newEntry = { icMake: normalizeText(r.matchedICMake!), icModel: extractBaseModel(normalizeText(r.matchedICModel!)) };
              const existing = newKnowledge.get(key);
              if (existing) {
                  if (!existing.find(e => e.icMake === newEntry.icMake && e.icModel === newEntry.icModel)) existing.push(newEntry);
              } else {
                  newKnowledge.set(key, [newEntry]);
              }
          });
          if (newKnowledge.size > 0) await sessionService.bulkAddToKnowledgeBase(newKnowledge);
      }
      
      if (layersToLearnFrom.rules && llmProvider) {
          const ruleExamples: RuleGenerationExample[] = highConfidenceMatches.map(r => ({ shoryMake: r.__shoryMake!, shoryModel: r.__shoryModel!, icMake: r.matchedICMake!, icModel: r.matchedICModel! }));
          const newRules = await llmProvider.generateRulesFromMatches(ruleExamples);
          if(newRules.length > 0) await sessionService.saveLearnedRules(newRules);
      }
  }
}

export const downloadCSV = (data: MappedRecord[], shoryConfig: ShoryColumnConfig, icConfig: ICColumnConfig, filename: string = 'mapped_results.csv'): void => {
  if (data.length === 0) return;
  const shoryOutputCols = shoryConfig.outputColumns.filter(c => c !== shoryConfig.make && c !== shoryConfig.model);
  const icCodeHeaders = icConfig.codes.map(codeCol => `Matched IC ${codeCol}`);
  const headers = [`Shory ${shoryConfig.make}`, `Shory ${shoryConfig.model}`, ...shoryOutputCols, 'Matched IC Make', 'Matched IC Model', ...icCodeHeaders, 'Match Status', 'Match Confidence (%)', 'Actual Fuzzy Score (%)', 'AI Match Reason', 'All Semantic Matches'];
  
  const csvRows = [headers.join(',')];
  const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  data.forEach(row => {
    const icCodeValues = icConfig.codes.map(codeCol => escapeCsv(row.matchedICCodes?.[codeCol]));
    const values = [
      escapeCsv(row[shoryConfig.make]), escapeCsv(row[shoryConfig.model]),
      ...shoryOutputCols.map(col => escapeCsv(row[col])),
      escapeCsv(row.matchedICMake), escapeCsv(row.matchedICModel),
      ...icCodeValues,
      escapeCsv(row.matchStatus),
      escapeCsv(row.matchConfidence !== undefined ? `${(row.matchConfidence * 100).toFixed(0)}%` : ''),
      escapeCsv(row.actualFuzzyScore !== undefined ? `${(row.actualFuzzyScore * 100).toFixed(0)}%` : '-'),
      escapeCsv(row.aiReason), escapeCsv((row.allSemanticMatches || []).join(', ')),
    ];
    csvRows.push(values.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
