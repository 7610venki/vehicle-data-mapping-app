

import { MappingSession, LearnedRule, LlmConfig, ProgressCallback, KnowledgeBaseEntry } from '../types';
import { supabase, supabaseUrl } from './supabaseClient';
import { sha256 } from 'js-sha256';
import { FUZZY_THRESHOLD_DEFAULT, KNOWLEDGE_BASE_IMPORT_BATCH_SIZE } from '../constants';

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

// Data structure for the `mapping_sessions` table rows
interface SessionDBRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  shory_file_data: any; // JSONB
  ic_file_data: any; // JSONB
  config_data: any; // JSONB
  parameters_data: any; // JSONB
  results_data: any; // JSONB
  llm_config_data: any; // JSONB
}

export class SessionService {
  
  constructor() {
    if (!supabase) {
      console.warn("Supabase is not initialized. Session management will be disabled.");
    }
  }

  private fromDbRow(row: SessionDBRow): MappingSession | null {
    try {
        const params = row.parameters_data || {};
        const llmConfig = row.llm_config_data || {};
        const config = row.config_data || {};

        if (!row.shory_file_data || !row.ic_file_data || !config.shoryConfig || !config.icConfig || !row.results_data || !llmConfig.provider) {
            console.warn("Skipping malformed session from DB:", row.id);
            return null;
        }

        return {
          id: row.id,
          name: row.name,
          createdAt: row.created_at,
          shoryFile: row.shory_file_data,
          icFile: row.ic_file_data,
          shoryConfig: config.shoryConfig,
          icConfig: config.icConfig,
          mappedData: row.results_data,
          fuzzyThreshold: params.fuzzyThreshold ?? FUZZY_THRESHOLD_DEFAULT,
          useFuzzyLayer: params.useFuzzyLayer ?? true,
          useAdvancedAiLayer: params.useAdvancedAiLayer ?? (params.useSemanticLLMLayer || params.useAiLayer) ?? true,
          useKnowledgeBaseLayer: params.useKnowledgeBaseLayer ?? true,
          useLearnedRulesLayer: params.useLearnedRulesLayer ?? true,
          llmConfig: {
              provider: llmConfig.provider,
              model: llmConfig.model,
          },
        };
    } catch(e) {
        console.error("Error parsing session from DB row:", row.id, e);
        return null;
    }
  }

  private toDbRow(session: Omit<MappingSession, 'id'|'createdAt'>, userId: string): Omit<SessionDBRow, 'id'|'created_at'> {
      return {
        user_id: userId,
        name: session.name,
        shory_file_data: session.shoryFile,
        ic_file_data: session.icFile,
        config_data: {
          shoryConfig: session.shoryConfig,
          icConfig: session.icConfig,
        },
        results_data: session.mappedData,
        parameters_data: {
            fuzzyThreshold: session.fuzzyThreshold,
            useFuzzyLayer: session.useFuzzyLayer,
            useAdvancedAiLayer: session.useAdvancedAiLayer,
            useKnowledgeBaseLayer: session.useKnowledgeBaseLayer,
            useLearnedRulesLayer: session.useLearnedRulesLayer,
        },
        llm_config_data: session.llmConfig
      };
  }

  async getSessions(userId: string): Promise<MappingSession[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('mapping_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return data
        .map(row => this.fromDbRow(row))
        .filter((s): s is MappingSession => s !== null);

    } catch (err: any) {
      console.error("Error retrieving sessions from Supabase:", err.message ? `${err.message} (Details: ${err.details})` : JSON.stringify(err));
      // In case of a relation not existing error, create the tables.
      if (err.message && (err.message.includes('relation "public.mapping_sessions" does not exist') || err.message.includes('relation "public.knowledge_base" does not exist'))) {
          throw new Error("Database tables are not set up. Please run the setup script in the Supabase SQL Editor.");
      }
      return [];
    }
  }

  async getSession(sessionId: string, userId: string): Promise<MappingSession | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('mapping_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();
      
      if (error) throw error;
      return data ? this.fromDbRow(data) : null;
    } catch (err: any) {
       console.error("Error retrieving session from Supabase:", err.message ? `${err.message} (Details: ${err.details})` : JSON.stringify(err));
       return null;
    }
  }

  async saveSession(sessionData: Omit<MappingSession, 'id' | 'createdAt'> & { id?: string }, userId: string): Promise<MappingSession> {
    if (!supabase) throw new Error("Database service is not available.");

    const dbRow = this.toDbRow(sessionData, userId);
    
    try {
      const { data, error } = await supabase
        .from('mapping_sessions')
        .upsert({ ...dbRow, id: sessionData.id }) // upsert handles both create and update
        .select()
        .single();
      
      if (error) throw error;
      const result = this.fromDbRow(data);
      if(!result) throw new Error("Saved session data could not be parsed back.");
      return result;
    } catch (err: any) {
      console.error("Error saving session to Supabase:", err.message ? `${err.message} (Details: ${err.details})` : JSON.stringify(err));
      throw new Error(`Failed to save session: ${err.message}`);
    }
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('mapping_sessions')
        .delete()
        .match({ id: sessionId, user_id: userId });
      
      if (error) throw error;
    } catch (err: any) {
      console.error("Error deleting session from Supabase:", err.message ? `${err.message} (Details: ${err.details})` : JSON.stringify(err));
    }
  }

  // --- Knowledge Base Methods ---

  // Fetches the GLOBAL knowledge base.
  async getKnowledgeBase(): Promise<Map<string, KnowledgeBaseEntry[]>> {
    if (!supabase) return new Map();
    try {
      // Fetch all entries, as this is a shared global resource. No user_id filter.
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('shory_normalized_key, ic_make_normalized, ic_model_normalized');
        
      if (error) {
        // Provide a more helpful error if the column was not dropped.
        if (error.message.includes('column "knowledge_base.user_id" must appear')) {
           throw new Error("Database schema mismatch. It seems the 'user_id' column still exists on 'knowledge_base' but the code expects it to be gone. Please update your database schema.");
        }
        throw error;
      }
      
      const kbMap = new Map<string, KnowledgeBaseEntry[]>();
      data.forEach(row => {
        const key = row.shory_normalized_key;
        const entry: KnowledgeBaseEntry = {
          icMake: row.ic_make_normalized,
          icModel: row.ic_model_normalized,
        };
        if(kbMap.has(key)) {
            kbMap.get(key)!.push(entry);
        } else {
            kbMap.set(key, [entry]);
        }
      });
      return kbMap;
    } catch (err: any) {
      console.error("Error retrieving knowledge base:", err.message ? `${err.message} (Details: ${err.details})` : JSON.stringify(err));
      throw err;
    }
  }

  // Gets the count of the GLOBAL knowledge base.
  async getKnowledgeBaseCount(): Promise<number> {
    if (!supabase) return 0;
    try {
        // Count all entries, as this is a shared global resource. No user_id filter.
        const { count, error } = await supabase
            .from('knowledge_base')
            .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        return count ?? 0;
    } catch (err: any) {
        console.error("Error getting knowledge base count:", err.message);
        return 0;
    }
  }

  // Adds entries to the GLOBAL knowledge base via a secure Edge Function to bypass RLS.
  async bulkAddToKnowledgeBase(newEntries: Map<string, KnowledgeBaseEntry[]>, onProgress?: ProgressCallback): Promise<void> {
    if (!supabase || !supabaseUrl || newEntries.size === 0) return;
    
    const entriesToUpsert = Array.from(newEntries.entries()).flatMap(([key, values]) => 
        values.map(value => ({
            shory_normalized_key: key,
            ic_make_normalized: value.icMake,
            ic_model_normalized: value.icModel,
        }))
    );
    
    const entryChunks = chunk(entriesToUpsert, KNOWLEDGE_BASE_IMPORT_BATCH_SIZE);
    let processedCount = 0;
    const totalCount = entriesToUpsert.length;

    onProgress?.(0, totalCount, "Starting import...");

    for (const [index, batch] of entryChunks.entries()) {
      try {
        const proxyEndpoint = `${supabaseUrl}/functions/v1/proxy-llm`;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error("User must be authenticated to update the knowledge base.");
        }

        const response = await fetch(proxyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                provider: 'knowledge-base-update',
                entries: batch,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({error: 'Could not parse error response.'}));
            throw new Error(errorBody.error || `Knowledge base update failed with status ${response.status}`);
        }

        processedCount += batch.length;
        onProgress?.(processedCount, totalCount, `Importing... (${index + 1}/${entryChunks.length})`);

      } catch (err: any) {
        console.error(`Error saving knowledge base chunk ${index + 1}:`, err.message);
        throw new Error(`Failed to save a batch of knowledge entries via proxy: ${err.message}.`);
      }
    }
    onProgress?.(totalCount, totalCount, "Import complete.");
  }

  // --- Learned Rules Methods ---
  
  // Fetches GLOBAL learned rules.
  async getLearnedRules(): Promise<LearnedRule[]> {
    if (!supabase) return [];
    try {
        // Fetch all rules, as this is a shared global resource. No user_id filter.
        const { data, error } = await supabase
            .from('learned_rules')
            .select('rule_json');

        if (error) throw error;
        return data.map(row => row.rule_json as LearnedRule);
    } catch (err: any) {
        console.error("Error retrieving learned rules:", err.message ? `${err.message} (Details: ${err.details})` : JSON.stringify(err));
        throw err;
    }
  }

  // Saves rules to the GLOBAL store.
  async saveLearnedRules(rules: LearnedRule[]): Promise<void> {
      if (!supabase || rules.length === 0) return;

      const rulesToUpsert = rules.map(rule => ({
          rule_json: rule,
          rule_hash: sha256(JSON.stringify({c: rule.conditions, a: rule.actions})), // Hash only the logic part to prevent duplicates
      }));

      try {
          // The onConflict constraint prevents duplicate rules globally.
          const { error } = await supabase
              .from('learned_rules')
              .upsert(rulesToUpsert, { onConflict: 'rule_hash' });

          if (error) throw error;
      } catch (err: any) {
          console.error("Error saving learned rules:", err.message ? `${err.message} (Details: ${err.details})` : JSON.stringify(err));
          throw new Error(`Failed to save learned rules: ${err.message}. Ensure the unique constraint 'learned_rules_global_hash_unique' exists.`);
      }
  }
}