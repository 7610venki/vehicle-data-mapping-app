


// --- IMPORTANT: UPDATE YOUR CREDENTIALS HERE ---
// API keys are now configured on the server-side in your Supabase Edge Function environment variables.
// Do not store API keys in client-side code.
export const GITHUB_REPO_URL = 'https://github.com/7610venki/vehicle-data-mapping-app'; // <-- UPDATE THIS

export const GEMINI_MODEL_TEXT = 'gemini-2.5-flash-preview-04-17';
export const CUSTOM_LLM_DEFAULT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
export const CUSTOM_LLM_DEFAULT_MODEL = 'llama3-8b-8192';

export const APP_TITLE = "Vehicle Data Mapping";

export const STEPS_CONFIG = [
  { id: 1, title: "Upload Shory File" },
  { id: 2, title: "Upload Insurance Co. File" },
  { id: 3, title: "Configure Columns" },
  { id: 4, title: "Set Parameters & Process" },
  { id: 5, title: "View Results" },
];

export const FUZZY_THRESHOLD_DEFAULT = 0.8; // 80% match
export const FUZZY_MAKE_SIMILARITY_THRESHOLD = 0.9; // Higher for make matching
export const FUZZY_MODEL_SIMILARITY_THRESHOLD_STRICT = 0.85; // Stricter for model after make match
export const FUZZY_MODEL_SIMILARITY_THRESHOLD_NORMAL = 0.75;


export const MAX_IC_RECORDS_FOR_AI_PROMPT = 100; // Limit IC records in AI prompt to prevent excessive length
export const TOP_N_CANDIDATES_FOR_SEMANTIC_LLM = 5; // Number of top fuzzy candidates for the semantic LLM layer

// Batch sizes can be larger for fast APIs like Groq
export const AI_WEB_SEARCH_BATCH_SIZE = 20; // Number of records to batch for the AI with Web Search layer (Gemini specific)
export const SEMANTIC_LLM_BATCH_SIZE = 15;   // Number of records to batch for the Semantic LLM layer (Reduced from 50 to prevent token limits)
export const KNOWLEDGE_BASE_IMPORT_BATCH_SIZE = 500; // Number of records to batch for knowledge base imports

export const LOCAL_STORAGE_SESSIONS_KEY = 'vehicle-mapper-sessions';
export const KNOWLEDGE_BASE_STORAGE_KEY = 'vehicle-mapper-knowledge-base';
export const KNOWLEDGE_BASE_CONFIDENCE_THRESHOLD = 0.95; // AI/Fuzzy matches above this score will be learned

// Keywords for base model extraction. Regex will match these as whole words.
export const TRIM_KEYWORDS = [
  'lariat', 'xle', 'se', 'le', 'limited', 'ltd', 'xlt', 'xl', 'slt', 'sle', 
  'gt', 'sport', 'sports', 'premium', 'plus', 'platinum', 'sr5', 'trd', 'pro',
  'touring', 'ex', 'lx', 'si', 'dx', 'sx', 'ex-l',
  'base', 'basic', 'value', 'classic', 'custom',
  'sedan', 'coupe', 'hatchback', 'wagon', 'convertible', 'suv', 'truck', 'van', 'minivan',
  '4dr', '2dr', '4d', '2d', 'sdn', 'cpe', 'hb', 'conv',
  'v6', 'v8', 'v10', 'v12', 'i4', 'i6', '4-cyl', '6-cyl', '8-cyl', 'l4', 'l6',
  'hybrid', 'phev', 'ev', 'electric', 'ecoboost', 'tdi', 'diesel',
  'awd', '4wd', 'fwd', 'rwd', '4x4', '4x2',
  'automatic', 'manual', 'auto', 'man', 'cvt',
  'long bed', 'short bed', 'crew cab', 'quad cab', 'king cab',
  'off-road', 'off road', 'z71', 'fx4',
  '2.0t', '2.5t', '3.5l', '5.0l', '1.5l', '2.0l', '3.0l',
  'type-r', 'type-s', 'nismo', 'amg', 'm-sport', 's-line', 'denali',
  'black edition', 'special edition', 'launch edition', 'trail hawk',
  'summit', 'overland', 'rubicon', 'sahara', 'altitude', 'latitude',
  'laredo', 'sel', 'titanium', 'st', 'rs', 'sv', 'sl',
  '1500', '2500', '3500', 'f-150', 'f-250', 'f-350' // Keep model numbers if they are trims
];
