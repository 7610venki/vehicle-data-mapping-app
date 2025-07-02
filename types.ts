
export interface GroundingSource {
  uri: string;
  title: string;
}

export interface DataRecord {
  [key:string]: string | number | { [columnName: string]: string; } | GroundingSource[] | string[] | undefined;
}

export interface ShoryRecord extends DataRecord {
  __id: string; // Internal unique ID
  __shoryMake?: string; // Extracted Shory Make for matching
  __shoryModel?: string; // Extracted Shory Model for matching
  __shoryBaseModel?: string; // Extracted Shory Base Model (trims removed)
}

export interface ICRecord extends DataRecord {
  __id: string; // Internal unique ID
  __icMake?: string; // Extracted IC Make for matching
  __icModel?: string; // Extracted IC Model for matching
  __icBaseModel?: string; // Extracted IC Base Model (trims removed)
  __icCodes?: { [columnName: string]: string }; // Extracted IC Codes, keyed by original column name
}

export enum MatchStatus {
  NOT_PROCESSED = 'Not Processed',
  MATCHED_KNOWLEDGE = 'Matched (Knowledge)',
  MATCHED_RULE = 'Matched (Learned Rule)',
  MATCHED_FUZZY = 'Matched (Fuzzy)',
  MATCHED_AI = 'Matched (AI)',
  MATCHED_SEMANTIC_LLM = 'Matched (Semantic LLM)',
  NO_MATCH = 'No Match',
  PROCESSING_AI = 'Processing (AI)',
  PROCESSING_SEMANTIC_LLM = 'Processing (Semantic LLM)',
  ERROR_AI = 'Error (AI)',
}

export interface MappedRecord extends ShoryRecord {
  matchedICMake?: string;
  matchedICModel?: string;
  matchedICCodes?: { [columnName: string]: string }; // Matched IC codes, keyed by original IC column name
  matchStatus: MatchStatus;
  matchConfidence?: number; // 0-1, higher is better, reflects confidence of the layer that made the match
  actualFuzzyScore?: number; // 0-1, best fuzzy score found, irrespective of thresholds/AI
  aiReason?: string; // One-line explanation from AI for its decision
  groundingSources?: GroundingSource[];
  allSemanticMatches?: string[]; // New: Stores all potential semantic matches
}

export interface ColumnSelection {
  make: string;
  model: string;
}

export interface ShoryColumnConfig extends ColumnSelection {
  outputColumns: string[];
}

export interface ICColumnConfig extends ColumnSelection {
  codes: string[]; // Column names for IC Codes
}

export interface FileData {
  name: string;
  records: DataRecord[]; // records are of type DataRecord
  headers: string[];
}

export enum AppStep {
  UPLOAD_SHORY = 1,
  UPLOAD_IC = 2,
  CONFIGURE_COLUMNS = 3,
  PROCESS_DATA = 4,
  SHOW_RESULTS = 5,
}

export type LlmProviderType = 'gemini' | 'custom';

export interface LlmConfig {
    provider: LlmProviderType;
    model: string; // e.g., 'gemini-1.5-flash' or 'llama3-8b-8192'
}

export interface MappingSession {
  id: string;
  name: string;
  createdAt: string; // ISO string for date
  shoryFile: FileData;
  icFile: FileData;
  shoryConfig: ShoryColumnConfig;
  icConfig: ICColumnConfig;
  mappedData: MappedRecord[];
  fuzzyThreshold: number;
  useFuzzyLayer: boolean;
  useAdvancedAiLayer: boolean;
  useKnowledgeBaseLayer: boolean;
  useLearnedRulesLayer: boolean;
  llmConfig: LlmConfig; // New property for LLM settings
}

export interface KnowledgeBaseEntry {
  icMake: string;
  icModel: string;
}

export interface LearnedRule {
  conditions: Array<{ field: 'make' | 'model', operator: 'contains' | 'equals', value: string }>;
  actions: { setMake: string, setModel: string };
}

// --- LLM Provider Interfaces ---
export interface SemanticCandidate {
  originalMake: string;
  originalModel: string;
  originalCodes?: { [key: string]: string };
  primaryCodeValue?: string;
  internalId: string;
}

export interface WebSearchBatchResult {
  shoryId: string;
  matchedICMake: string | null;
  matchedICModel: string | null;
  matchedICCode: string | null;
  confidence: number | null;
  reason: string;
  groundingSources?: GroundingSource[];
}

export interface SemanticLLMBatchResult {
  shoryId: string;
  chosenICIndex: number | null;
  confidence: number | null;
  reason: string;
}

export interface SemanticBatchTask {
  shoryId: string;
  shoryMake: string;
  shoryModel: string;
  candidates: SemanticCandidate[];
}

export interface RuleGenerationExample {
    shoryMake: string;
    shoryModel: string;
    icMake: string;
    icModel: string;
}

export interface GenerateContentResponse {
  text: string;
  candidates?: Array<{
    content: { parts: Array<{ text: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web: { uri: string; title: string } }> };
  }>;
}

export interface LlmProvider {
    findBestMatchBatch(
        shoryRecords: { id: string, make: string, model: string }[],
        icMakeModelList: { make: string; model: string; code?: string }[]
    ): AsyncGenerator<WebSearchBatchResult, void, undefined>;

    semanticCompareWithLimitedListBatch(
        tasks: SemanticBatchTask[]
    ): AsyncGenerator<SemanticLLMBatchResult, void, undefined>;

    generateRulesFromMatches(examples: RuleGenerationExample[]): Promise<LearnedRule[]>;
}

export type ProgressCallback = (processed: number, total: number, message: string) => void;
