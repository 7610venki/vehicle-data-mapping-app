

import { 
    LearnedRule, 
    RuleGenerationExample, 
    SemanticBatchTask, 
    WebSearchBatchResult 
} from "../../types";

export interface LlmProvider {
    findBestMatchBatch(
        shoryRecords: { id: string, make: string, model: string }[],
        icMakeModelList: { make: string; model: string; code?: string }[]
    ): Promise<Map<string, WebSearchBatchResult>>;

    semanticCompareWithLimitedListBatch(
        tasks: SemanticBatchTask[]
    ): Promise<Map<string, { matchedICInternalId: string | null; confidence: number | null; aiReason?: string }>>;

    generateRulesFromMatches(examples: RuleGenerationExample[]): Promise<LearnedRule[]>;
}