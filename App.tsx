
import React, { useState, useEffect, useCallback, useReducer, createContext, useContext, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import {
  ShoryRecord,
  ICRecord,
  MappedRecord,
  ShoryColumnConfig,
  ICColumnConfig,
  FileData,
  AppStep,
  MappingSession,
  LearnedRule,
  LlmProviderType,
  LlmProvider,
  ProgressCallback,
  KnowledgeBaseEntry,
} from './types';
import { APP_TITLE, STEPS_CONFIG, FUZZY_THRESHOLD_DEFAULT, GEMINI_MODEL_TEXT, CUSTOM_LLM_DEFAULT_MODEL, GITHUB_REPO_URL } from './constants';
import { supabase } from './services/supabaseClient';
import FileUpload from './components/FileUpload';
import ColumnSelector from './components/ColumnSelector';
import ResultsTable from './components/ResultsTable';
import LoadingSpinner from './components/LoadingSpinner';
import ProgressBar from './components/ProgressBar';
import SessionManager from './components/SessionManager';
import Auth from './components/Auth';
import ActionButton from './components/ActionButton';
import { parseFile } from './services/fileParserService';
import { MappingService, downloadCSV } from './services/mappingService';
import { SessionService } from './services/sessionService';
import { GeminiProvider } from './services/llm/geminiProvider';
import { CustomProvider } from './services/llm/customProvider';
import { normalizeText, extractBaseModel } from './services/normalizationService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './components/Card';
import Alert from './components/Alert';
import { ExpandableTabs, TabItem } from './components/ui/expandable-tabs-1';
import { DialogProvider, useDialog } from './components/DialogProvider';
import { cn } from './lib/utils';
import { 
    ArrowRightIcon, DownloadIcon, SettingsIcon, RestartIcon, SaveIcon, LogOutIcon, CpuIcon, DatabaseZapIcon, HelpCircleIcon,
} from './components/Icons'; 
import { FileUp, FilePlus2, ListChecks, Settings2, Table2 } from 'lucide-react';

//==============================================================================
// 1. CONTEXTS & PROVIDERS
//==============================================================================

// --- Auth Context ---
interface AuthContextType {
  session: Session | null;
  signOut: () => Promise<void>;
  appReady: boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setAppReady(true);
      }).catch(err => {
        console.error("Error getting session:", err);
        setAppReady(true);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });
      return () => subscription.unsubscribe();
    } else {
      setAppReady(true);
    }
  }, []);

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider value={{ session, signOut, appReady }}>
      {children}
    </AuthContext.Provider>
  );
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

// --- Settings Context ---
interface SettingsContextType {
  llmProviderType: LlmProviderType;
  setLlmProviderType: (type: LlmProviderType) => void;
  customLlmApiKey: string;
  setCustomLlmApiKey: (key: string) => void;
  customLlmModel: string;
  setCustomLlmModel: (model: string) => void;
  activeModel: string;
  llmProviderInstance: LlmProvider | null;
  llmError: string | null;
  fuzzyThreshold: number;
  setFuzzyThreshold: (val: number) => void;
  useKnowledgeBaseLayer: boolean;
  setUseKnowledgeBaseLayer: (val: boolean) => void;
  useLearnedRulesLayer: boolean;
  setUseLearnedRulesLayer: (val: boolean) => void;
  useFuzzyLayer: boolean;
  setUseFuzzyLayer: (val: boolean) => void;
  useAdvancedAiLayer: boolean;
  setUseAdvancedAiLayer: (val: boolean) => void;
}
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [fuzzyThreshold, setFuzzyThreshold] = useState<number>(FUZZY_THRESHOLD_DEFAULT);
  const [llmProviderType, setLlmProviderType] = useState<LlmProviderType>('gemini');
  const [customLlmApiKey, setCustomLlmApiKey] = useState<string>('');
  const [customLlmModel, setCustomLlmModel] = useState<string>(CUSTOM_LLM_DEFAULT_MODEL);
  const [activeModel, setActiveModel] = useState<string>(GEMINI_MODEL_TEXT);
  const [llmProviderInstance, setLlmProviderInstance] = useState<LlmProvider | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  const [useKnowledgeBaseLayer, setUseKnowledgeBaseLayer] = useState<boolean>(true);
  const [useLearnedRulesLayer, setUseLearnedRulesLayer] = useState<boolean>(true);
  const [useFuzzyLayer, setUseFuzzyLayer] = useState<boolean>(true);
  const [useAdvancedAiLayer, setUseAdvancedAiLayer] = useState<boolean>(true);
  
  const handleApiKeyChange = (key: string) => {
    setCustomLlmApiKey(key);
    sessionStorage.setItem('customLlmApiKey', key);
  }

  const handleModelChange = (model: string) => {
    setCustomLlmModel(model);
    sessionStorage.setItem('customLlmModel', model);
  }

  useEffect(() => {
    const savedApiKey = sessionStorage.getItem('customLlmApiKey');
    const savedModel = sessionStorage.getItem('customLlmModel');
    if (savedApiKey) setCustomLlmApiKey(savedApiKey);
    if (savedModel) setCustomLlmModel(savedModel);
  }, []);

  useEffect(() => {
    setLlmError(null);
    setLlmProviderInstance(null);
    try {
      if (!supabase) throw new Error("Supabase client is not available. AI providers requiring a secure proxy cannot be used.");
      
      if (llmProviderType === 'gemini') {
        setLlmProviderInstance(new GeminiProvider(supabase));
        setActiveModel(GEMINI_MODEL_TEXT);
        setUseAdvancedAiLayer(true);
      } else if (llmProviderType === 'custom') {
        if (!customLlmApiKey || !customLlmModel) throw new Error("API Key and Model are required for Custom LLM.");
        setLlmProviderInstance(new CustomProvider(customLlmApiKey, customLlmModel, supabase));
        setActiveModel(customLlmModel);
        setUseAdvancedAiLayer(true);
      }
    } catch (e: any) {
      setLlmError(`AI Service Unavailable: ${e.message}`);
      setUseAdvancedAiLayer(false);
    }
  }, [llmProviderType, customLlmApiKey, customLlmModel]);

  return (
    <SettingsContext.Provider value={{
      llmProviderType, setLlmProviderType,
      customLlmApiKey, setCustomLlmApiKey: handleApiKeyChange,
      customLlmModel, setCustomLlmModel: handleModelChange,
      activeModel, llmProviderInstance, llmError,
      fuzzyThreshold, setFuzzyThreshold,
      useKnowledgeBaseLayer, setUseKnowledgeBaseLayer,
      useLearnedRulesLayer, setUseLearnedRulesLayer,
      useFuzzyLayer, setUseFuzzyLayer,
      useAdvancedAiLayer, setUseAdvancedAiLayer
    }}>
      {children}
    </SettingsContext.Provider>
  );
};
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};

// --- Mapping Context ---
type AppState = {
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  progress: { current: number; total: number; message: string } | null;
};
type AppAction =
  | { type: 'START_LOADING'; payload: { message: string } }
  | { type: 'STOP_LOADING' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'START_PROCESS'; payload: { message: string; total: number } }
  | { type: 'SET_PROGRESS'; payload: { current: number; total: number; message: string } };

const initialAppState: AppState = { isLoading: false, loadingMessage: '', error: null, progress: null };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_LOADING': return { ...state, isLoading: true, loadingMessage: action.payload.message, error: null };
    case 'STOP_LOADING': return { ...state, isLoading: false, loadingMessage: '', progress: null };
    case 'SET_ERROR': return { ...state, isLoading: false, error: action.payload };
    case 'START_PROCESS': return { ...state, isLoading: true, loadingMessage: action.payload.message, error: null, progress: { current: 0, total: action.payload.total, message: "Initializing..." } };
    case 'SET_PROGRESS': return { ...state, progress: action.payload };
    default: return state;
  }
}

interface MappingContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  viewMode: 'auth' | 'welcome' | 'mapping';
  setViewMode: (mode: 'auth' | 'welcome' | 'mapping') => void;
  currentStep: AppStep;
  setCurrentStep: (step: AppStep) => void;
  shoryFile: FileData | null;
  icFile: FileData | null;
  shoryConfig: ShoryColumnConfig;
  icConfig: ICColumnConfig;
  mappedData: MappedRecord[];
  sessions: MappingSession[];
  currentSessionId: string | null;
  knowledgeBaseCount: number | null;
  isImportingKnowledge: boolean;
  knowledgeImportProgress: {current: number, total: number, message: string} | null;
  handleFileUpload: (file: File, type: 'shory' | 'ic') => Promise<void>;
  setShoryConfig: (config: ShoryColumnConfig) => void;
  setIcConfig: (config: ICColumnConfig) => void;
  handleProcessData: () => Promise<void>;
  handleImportKnowledgeBase: (knowledgeFile: File) => Promise<void>;
  resetApp: (startNew?: boolean) => void;
  handleSaveSession: () => Promise<void>;
  handleLoadSession: (sessionToLoad: MappingSession) => void;
  handleDeleteSession: (sessionId: string) => Promise<void>;
  handleStartNewSession: () => void;
}
const MappingContext = createContext<MappingContextType | undefined>(undefined);

const MappingProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(appReducer, initialAppState);
    const { session } = useAuth();
    const settings = useSettings();
    const { alert, prompt } = useDialog();

    const [viewMode, setViewMode] = useState<'auth' | 'welcome' | 'mapping'>('auth');
    const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.UPLOAD_SHORY);
    const [shoryFile, setShoryFile] = useState<FileData | null>(null);
    const [icFile, setIcFile] = useState<FileData | null>(null);
    const [shoryConfig, setShoryConfig] = useState<ShoryColumnConfig>({ make: '', model: '', outputColumns: [] });
    const [icConfig, setIcConfig] = useState<ICColumnConfig>({ make: '', model: '', codes: [] });
    const [mappedData, setMappedData] = useState<MappedRecord[]>([]);
    const [sessions, setSessions] = useState<MappingSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isImportingKnowledge, setIsImportingKnowledge] = useState<boolean>(false);
    const [knowledgeImportProgress, setKnowledgeImportProgress] = useState<{current: number, total: number, message: string} | null>(null);
    const [knowledgeBaseCount, setKnowledgeBaseCount] = useState<number | null>(null);
    
    const [sessionServiceInstance] = useState<SessionService | null>(() => supabase ? new SessionService() : null);

    const fetchKnowledgeBaseCount = useCallback(async () => {
        if (session && sessionServiceInstance) {
          const count = await sessionServiceInstance.getKnowledgeBaseCount();
          setKnowledgeBaseCount(count);
        }
    }, [session, sessionServiceInstance]);

    useEffect(() => {
        if (session && sessionServiceInstance) {
            dispatch({ type: 'START_LOADING', payload: { message: "Loading sessions..." } });
            Promise.all([
              sessionServiceInstance.getSessions(session.user.id),
              fetchKnowledgeBaseCount()
            ]).then(([savedSessions]) => {
                setSessions(savedSessions);
                setViewMode(savedSessions.length > 0 ? 'welcome' : 'mapping');
            }).catch((err) => {
                dispatch({ type: 'SET_ERROR', payload: `Failed to load sessions: ${err.message}. Please ensure database tables are set up correctly.` });
            }).finally(() => {
                dispatch({ type: 'STOP_LOADING' });
            });
        } else {
            setViewMode('auth');
        }
    }, [session, sessionServiceInstance, fetchKnowledgeBaseCount]);

    const resetApp = useCallback((startNew: boolean = false) => {
        setCurrentStep(AppStep.UPLOAD_SHORY);
        setShoryFile(null); setIcFile(null);
        setShoryConfig({ make: '', model: '', outputColumns: [] });
        setIcConfig({ make: '', model: '', codes: [] });
        settings.setFuzzyThreshold(FUZZY_THRESHOLD_DEFAULT);
        setMappedData([]);
        dispatch({ type: 'SET_ERROR', payload: null });
        dispatch({ type: 'STOP_LOADING' });
        setCurrentSessionId(null);
        
        settings.setLlmProviderType('gemini');
        settings.setUseKnowledgeBaseLayer(!!sessionServiceInstance); 
        settings.setUseLearnedRulesLayer(!!sessionServiceInstance);
        settings.setUseFuzzyLayer(true);
        settings.setUseAdvancedAiLayer(true); 
        
        if (!startNew && sessions.length > 0) {
            setViewMode('welcome');
        } else {
            setViewMode('mapping');
        }
    }, [sessions, sessionServiceInstance, settings]);

    const handleFileUpload = async (file: File, type: 'shory' | 'ic') => {
        dispatch({ type: 'START_LOADING', payload: { message: `Parsing ${file.name}...` } });
        try {
          const parsedData = await parseFile(file);
          if (type === 'shory') {
            setShoryFile(parsedData);
            setShoryConfig(prev => ({ ...prev, make: parsedData.headers.find(h => h.toLowerCase().includes('make') || h.toLowerCase().includes('brand')) || '', model: parsedData.headers.find(h => h.toLowerCase().includes('model')) || '', outputColumns: parsedData.headers }));
            setCurrentStep(AppStep.UPLOAD_IC);
          } else {
            setIcFile(parsedData);
            setIcConfig(prev => ({ ...prev, make: parsedData.headers.find(h => h.toLowerCase().includes('make') || h.toLowerCase().includes('brand')) || '', model: parsedData.headers.find(h => h.toLowerCase().includes('model')) || '', codes: parsedData.headers.filter(h => h.toLowerCase().includes('code') || h.toLowerCase().includes('id')).slice(0,1) }));
            setCurrentStep(AppStep.CONFIGURE_COLUMNS);
          }
        } catch (err: any) {
          dispatch({ type: 'SET_ERROR', payload: `Error parsing ${file.name}: ${err.message}` });
        } finally {
          dispatch({ type: 'STOP_LOADING' });
        }
    };

    const handleProcessData = async () => {
        if (!shoryFile || !icFile || !shoryConfig.make || !shoryConfig.model || !icConfig.make || !icConfig.model) {
            dispatch({ type: 'SET_ERROR', payload: "Please upload both files and select make/model columns for each." });
            return;
        }
        if (!settings.useFuzzyLayer && !settings.useAdvancedAiLayer && !settings.useKnowledgeBaseLayer && !settings.useLearnedRulesLayer) {
            dispatch({ type: 'SET_ERROR', payload: "Please enable at least one matching layer." });
            return;
        }
        if (!settings.llmProviderInstance) {
            dispatch({ type: 'SET_ERROR', payload: "AI Provider is not configured correctly. Please check your settings in the Parameters step." });
            return;
        }

        dispatch({ type: 'START_PROCESS', payload: { message: 'Preparing data for mapping...', total: shoryFile.records.length }});
        setMappedData([]); 

        const shoryRecordsWithId: ShoryRecord[] = shoryFile.records.map((r, i) => ({ ...r, __id: `shory-${i}`}));
        const icRecordsWithId: ICRecord[] = icFile.records.map((r, i) => ({ ...r, __id: `ic-${i}`}));
        
        const mappingService = new MappingService(settings.llmProviderInstance);
        
        let knowledgeBase = new Map<string, KnowledgeBaseEntry[]>();
        let learnedRules: LearnedRule[] = [];
        if (session && sessionServiceInstance) {
            try {
              [knowledgeBase, learnedRules] = await Promise.all([
                  sessionServiceInstance.getKnowledgeBase(),
                  sessionServiceInstance.getLearnedRules()
              ]);
            } catch (err: any) {
                dispatch({ type: 'SET_ERROR', payload: `Could not fetch cloud data: ${err.message}`});
                return;
            }
        }

        try {
          const results = await mappingService.mapData(
            shoryRecordsWithId, icRecordsWithId, shoryConfig, icConfig, settings.fuzzyThreshold,
            settings.useKnowledgeBaseLayer, settings.useLearnedRulesLayer, settings.useFuzzyLayer, settings.useAdvancedAiLayer, knowledgeBase, learnedRules,
            (processedRecord, currentIndex, total) => { 
                setMappedData(prevData => {
                  const existingIndex = prevData.findIndex(item => item.__id === processedRecord.__id);
                  if (existingIndex > -1) {
                    const newData = [...prevData];
                    newData[existingIndex] = processedRecord;
                    return newData;
                  }
                  return [...prevData, processedRecord].sort((a,b) => parseInt(a.__id.split('-')[1]) - parseInt(b.__id.split('-')[1]));
                });
                const percentage = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
                dispatch({type: 'SET_PROGRESS', payload: {current: currentIndex + 1, total: total, message: `Processed ${currentIndex + 1} of ${total} (${percentage.toFixed(0)}%)`}});
            }
          );
          setMappedData(results);
          
          if (session && sessionServiceInstance && settings.llmProviderInstance) {
              dispatch({ type: 'START_LOADING', payload: { message: "AI is learning from this session..." } });
              await mappingService.performLearning(results, icConfig, settings.llmProviderInstance, sessionServiceInstance, { knowledgeBase: settings.useKnowledgeBaseLayer, rules: settings.useLearnedRulesLayer });
              await fetchKnowledgeBaseCount();
          }

          setCurrentStep(AppStep.SHOW_RESULTS);
        } catch (err: any) {
          dispatch({ type: 'SET_ERROR', payload: `Error during mapping: ${err.message}` });
        } finally {
          dispatch({ type: 'STOP_LOADING' });
        }
    };

    const handleImportKnowledgeBase = async (knowledgeFile: File) => {
        if (!sessionServiceInstance || !session) {
          dispatch({ type: 'SET_ERROR', payload: "Please select a file to import and ensure you are logged in." });
          return;
        }
        setIsImportingKnowledge(true);
        setKnowledgeImportProgress({ current: 0, total: 1, message: "Parsing file..." });
        dispatch({ type: 'SET_ERROR', payload: null });
    
        try {
          const parsedData = await parseFile(knowledgeFile);
          const { records, headers } = parsedData;
          const requiredHeaders = ['shory_make', 'shory_model', 'ic_make', 'ic_model'];
          if (requiredHeaders.some(h => !headers.includes(h))) throw new Error(`Invalid file format. Missing columns: ${requiredHeaders.filter(h => !headers.includes(h)).join(', ')}`);
          
          setKnowledgeImportProgress({ current: 0, total: records.length, message: "Normalizing records..." });
          
          const newKnowledge = new Map<string, KnowledgeBaseEntry[]>();
          for (const record of records) {
            const shoryMake = normalizeText(record.shory_make as string);
            const shoryModel = normalizeText(record.shory_model as string);
            const icMake = normalizeText(record.ic_make as string);
            const icModel = normalizeText(record.ic_model as string);
            
            if (shoryMake && shoryModel && icMake && icModel) {
                const shoryBaseModel = extractBaseModel(shoryModel);
                const icBaseModel = extractBaseModel(icModel);
                const key = `${shoryMake}|${shoryBaseModel}`;
                const newEntry: KnowledgeBaseEntry = { icMake, icModel: icBaseModel };

                const existingEntries = newKnowledge.get(key);
                if (existingEntries) {
                    if (!existingEntries.find(e => e.icMake === newEntry.icMake && e.icModel === newEntry.icModel)) {
                        existingEntries.push(newEntry);
                    }
                } else {
                    newKnowledge.set(key, [newEntry]);
                }
            }
          }
          
          const onProgress: ProgressCallback = (p, t, m) => setKnowledgeImportProgress({ current: p, total: t, message: m });
          const totalUniqueMappings = Array.from(newKnowledge.values()).reduce((sum, arr) => sum + arr.length, 0);

          await sessionServiceInstance.bulkAddToKnowledgeBase(newKnowledge, onProgress);
          await fetchKnowledgeBaseCount();
          await alert({ title: 'Import Successful', message: `Successfully processed ${records.length} records. Imported ${totalUniqueMappings} unique mappings into the global knowledge base.` });
    
        } catch (err: any) {
          dispatch({ type: 'SET_ERROR', payload: `Error importing knowledge base: ${err.message}` });
        } finally {
          setIsImportingKnowledge(false);
          setKnowledgeImportProgress(null);
        }
    };
    
    const handleSaveSession = async () => {
        if (!shoryFile || !icFile || !mappedData.length || !sessionServiceInstance || !session) return;
        
        const sessionName = await prompt({
            title: "Save Session",
            message: "Enter a name for this session:",
            defaultValue: currentSessionId ? sessions.find(s => s.id === currentSessionId)?.name : (shoryFile.name.split('.')[0] || "My Session"),
            confirmText: "Save",
        });

        if (sessionName) {
          dispatch({ type: 'START_LOADING', payload: { message: "Saving session..." } });
          try {
            const sessionData: Omit<MappingSession, 'createdAt' | 'id'> & {id?: string} = {
              id: currentSessionId || undefined,
              name: sessionName, shoryFile, icFile, shoryConfig, icConfig, mappedData, 
              fuzzyThreshold: settings.fuzzyThreshold,
              useFuzzyLayer: settings.useFuzzyLayer, useAdvancedAiLayer: settings.useAdvancedAiLayer, 
              useKnowledgeBaseLayer: settings.useKnowledgeBaseLayer, useLearnedRulesLayer: settings.useLearnedRulesLayer,
              llmConfig: { provider: settings.llmProviderType, model: settings.activeModel }
            };
            const saved = await sessionServiceInstance.saveSession(sessionData, session.user.id);
            setCurrentSessionId(saved.id);
            const updatedSessions = await sessionServiceInstance.getSessions(session.user.id);
            setSessions(updatedSessions);
            await alert({ title: "Success", message: `Session "${sessionName}" saved successfully!` });
          } catch(err: any) {
            dispatch({ type: 'SET_ERROR', payload: `Failed to save session: ${err.message}` });
          } finally {
            dispatch({ type: 'STOP_LOADING' });
          }
        }
    };

    const handleLoadSession = (sessionToLoad: MappingSession) => {
        setCurrentSessionId(sessionToLoad.id); 
        setShoryFile(sessionToLoad.shoryFile);
        setIcFile(sessionToLoad.icFile); 
        setShoryConfig(sessionToLoad.shoryConfig);
        setIcConfig(sessionToLoad.icConfig); 
        setMappedData(sessionToLoad.mappedData);
        settings.setFuzzyThreshold(sessionToLoad.fuzzyThreshold); 
        settings.setUseFuzzyLayer(sessionToLoad.useFuzzyLayer);
        settings.setUseAdvancedAiLayer(sessionToLoad.useAdvancedAiLayer);
        settings.setUseKnowledgeBaseLayer(sessionToLoad.useKnowledgeBaseLayer);
        settings.setUseLearnedRulesLayer(sessionToLoad.useLearnedRulesLayer);
        settings.setLlmProviderType(sessionToLoad.llmConfig.provider);
        if (sessionToLoad.llmConfig.provider === 'custom') {
          settings.setCustomLlmModel(sessionToLoad.llmConfig.model);
        }
        dispatch({ type: 'SET_ERROR', payload: null });
        dispatch({ type: 'STOP_LOADING' });
        setCurrentStep(AppStep.SHOW_RESULTS); 
        setViewMode('mapping');
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!sessionServiceInstance || !session) return;
        dispatch({ type: 'START_LOADING', payload: { message: "Deleting session..." } });
        await sessionServiceInstance.deleteSession(sessionId, session.user.id);
        const updatedSessions = await sessionServiceInstance.getSessions(session.user.id);
        setSessions(updatedSessions);
        dispatch({ type: 'STOP_LOADING' });
    };

    const handleStartNewSession = () => resetApp(true);
    
    return (
        <MappingContext.Provider value={{
            state, dispatch, viewMode, setViewMode, currentStep, setCurrentStep,
            shoryFile, icFile, shoryConfig, icConfig, mappedData, sessions, currentSessionId,
            knowledgeBaseCount, isImportingKnowledge, knowledgeImportProgress,
            handleFileUpload, setShoryConfig, setIcConfig, handleProcessData, handleImportKnowledgeBase,
            resetApp, handleSaveSession, handleLoadSession, handleDeleteSession, handleStartNewSession,
        }}>
            {children}
        </MappingContext.Provider>
    );
};
export const useMapping = () => {
    const context = useContext(MappingContext);
    if (!context) throw new Error('useMapping must be used within a MappingProvider');
    return context;
};

//==============================================================================
// 2. MAIN APP COMPONENT
//==============================================================================

const AppCore = () => {
  const { session, signOut, appReady } = useAuth();
  const settings = useSettings();
  const mapping = useMapping();
  const { state: { isLoading, loadingMessage, error, progress }, dispatch } = mapping;

  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);

  const handleSignOut = async () => {
    await signOut();
    mapping.resetApp(true);
    mapping.setViewMode('auth');
  }

  const handleTabNavigation = (tabId: string) => {
    const targetStepId = parseInt(tabId, 10);
    if (targetStepId <= mapping.currentStep) mapping.setCurrentStep(targetStepId as AppStep);
  };

  const EXPANDABLE_TABS_CONFIG: TabItem[] = STEPS_CONFIG.map(step => ({
    id: step.id.toString(),
    icon: [FileUp, FilePlus2, ListChecks, Settings2, Table2][step.id-1],
    label: step.title,
    color: ['bg-primary', 'bg-blue-700', 'bg-sky-600', 'bg-indigo-500', 'bg-slate-600'][step.id-1],
  }));

  const renderContent = () => {
    if (!appReady) return <Card className="shadow-fluid-md animate-fadeIn"><CardContent className="py-20"><LoadingSpinner message="Initializing application..." /></CardContent></Card>;
    if (!session) return <Auth />;
    if (isLoading && mapping.viewMode !== 'mapping') return <Card className="shadow-fluid-md animate-fadeIn"><CardContent className="py-20"><LoadingSpinner message={loadingMessage} /></CardContent></Card>;
    
    if (mapping.viewMode === 'welcome') {
      return (
        <SessionManager
          sessions={mapping.sessions}
          onLoad={(id) => { const sessionToLoad = mapping.sessions.find(s=>s.id === id); if(sessionToLoad) mapping.handleLoadSession(sessionToLoad); }}
          onDelete={mapping.handleDeleteSession}
          onNewSession={mapping.handleStartNewSession}
        />
      );
    }
    
    const animationClass = "animate-fadeIn";
    switch (mapping.currentStep) {
      case AppStep.UPLOAD_SHORY:
        return (
          <Card className={`${animationClass} shadow-fluid-md`}>
            <CardHeader><CardTitle>Upload Shory Vehicle Data</CardTitle><CardDescription>Select the CSV or XLSX file containing Shory vehicle information.</CardDescription></CardHeader>
            <CardContent><FileUpload id="shory-upload" label="Shory File (CSV/XLSX)" onFileUpload={(file) => mapping.handleFileUpload(file, 'shory')} disabled={isLoading}/></CardContent>
          </Card>
        );
      case AppStep.UPLOAD_IC:
        return (
          <Card className={`${animationClass} shadow-fluid-md`}>
            <CardHeader><CardTitle>Upload Insurance Company Data</CardTitle><CardDescription>Select the CSV or XLSX file provided by the Insurance Company.</CardDescription></CardHeader>
            <CardContent>
              {mapping.shoryFile && <Alert variant="info" title="Shory File Loaded" className="mb-6 text-sm">{mapping.shoryFile.name}</Alert>}
              <FileUpload id="ic-upload" label="Insurance Co. File (CSV/XLSX)" onFileUpload={(file) => mapping.handleFileUpload(file, 'ic')} disabled={isLoading}/>
            </CardContent>
             <CardFooter className="justify-start"><ActionButton variant="outline" onClick={() => mapping.setCurrentStep(AppStep.UPLOAD_SHORY)}>Back</ActionButton></CardFooter>
          </Card>
        );
      case AppStep.CONFIGURE_COLUMNS:
        if (!mapping.shoryFile || !mapping.icFile) return <Alert variant="destructive" title="File Error">Files not loaded correctly. Please start over.</Alert>;
        return (
          <div className={`${animationClass} space-y-8`}>
            <Card className="shadow-fluid-md">
                <CardHeader><CardTitle>Configure Data Columns</CardTitle><CardDescription>Define column mappings for accurate matching.</CardDescription></CardHeader>
                <CardContent className="space-y-8">
                    <Alert variant="info" className="text-sm"><p className="font-semibold mb-1.5">Files Ready:</p><ul className="list-disc list-inside text-muted-foreground space-y-1"><li>Shory: {mapping.shoryFile.name} ({mapping.shoryFile.records.length} records)</li><li>IC: {mapping.icFile.name} ({mapping.icFile.records.length} records)</li></ul></Alert>
                    <ColumnSelector idPrefix="shory" title="Shory File Configuration" headers={mapping.shoryFile.headers} selectedMake={mapping.shoryConfig.make} selectedModel={mapping.shoryConfig.model} onMakeChange={(val) => mapping.setShoryConfig({ ...mapping.shoryConfig, make: val })} onModelChange={(val) => mapping.setShoryConfig({ ...mapping.shoryConfig, model: val })} additionalColumns={mapping.shoryFile.headers} selectedAdditionalColumns={mapping.shoryConfig.outputColumns} onAdditionalColumnsChange={(cols) => mapping.setShoryConfig({...mapping.shoryConfig, outputColumns: cols})} />
                    <ColumnSelector idPrefix="ic" title="Insurance Company File Configuration" headers={mapping.icFile.headers} selectedMake={mapping.icConfig.make} selectedModel={mapping.icConfig.model} onMakeChange={(val) => mapping.setIcConfig({ ...mapping.icConfig, make: val })} onModelChange={(val) => mapping.setIcConfig({ ...mapping.icConfig, model: val })} selectedCodes={mapping.icConfig.codes} onCodesChange={(selectedCodes) => mapping.setIcConfig({...mapping.icConfig, codes: selectedCodes})} />
                </CardContent>
                <CardFooter className="flex justify-between">
                    <ActionButton variant="outline" onClick={() => mapping.setCurrentStep(AppStep.UPLOAD_IC)}>Back</ActionButton>
                    <ActionButton onClick={() => mapping.setCurrentStep(AppStep.PROCESS_DATA)} disabled={!mapping.shoryConfig.make || !mapping.shoryConfig.model || !mapping.icConfig.make || !mapping.icConfig.model} icon={<ArrowRightIcon />} iconPosition="right">Next: Parameters</ActionButton>
                </CardFooter>
            </Card>
          </div>
        );
      case AppStep.PROCESS_DATA:
        return (
          <Card className={`${animationClass} shadow-fluid-md`}>
            <CardHeader><CardTitle>Set Parameters & Process</CardTitle><CardDescription>Fine-tune matching layers and AI provider.</CardDescription></CardHeader>
            <CardContent className="space-y-8">
              <Card className="bg-muted/60 border-border">
                  <CardHeader><CardTitle className="text-lg font-semibold flex items-center"><CpuIcon className="w-5 h-5 mr-2.5 text-primary"/>AI Provider Configuration</CardTitle></CardHeader>
                  <CardContent className="space-y-4 pt-3">
                      <div className="flex items-center space-x-4">
                          <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="llmProvider" value="gemini" checked={settings.llmProviderType === 'gemini'} onChange={() => settings.setLlmProviderType('gemini')} className="form-radio text-primary" /> <span>Google Gemini</span></label>
                          <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="llmProvider" value="custom" checked={settings.llmProviderType === 'custom'} onChange={() => settings.setLlmProviderType('custom')} className="form-radio text-primary" /> <span>Custom LLM (Groq)</span></label>
                      </div>
                      {settings.llmProviderType === 'custom' && (
                          <div className="p-4 bg-card border rounded-lg space-y-3 mt-3 animate-fadeIn">
                              <Alert variant="info" title="Proxy Configuration Note">Custom providers use a secure backend proxy. For this to work, you must deploy the <code>proxy-llm</code> Edge Function in your Supabase project.</Alert>
                              <div><label className="text-sm font-medium text-foreground" htmlFor="custom-api-key">API Key (e.g., from Groq)</label><input id="custom-api-key" type="password" value={settings.customLlmApiKey} onChange={(e) => settings.setCustomLlmApiKey(e.target.value)} className="form-input w-full mt-1.5" placeholder="Enter your custom provider API key"/></div>
                              <div><label className="text-sm font-medium text-foreground" htmlFor="custom-model">Model Name</label><input id="custom-model" type="text" value={settings.customLlmModel} onChange={(e) => settings.setCustomLlmModel(e.target.value)} className="form-input w-full mt-1.5" placeholder="e.g., llama3-8b-8192"/></div>
                          </div>
                      )}
                      {settings.llmError && <Alert variant="destructive" title="AI Provider Error" className="mt-3">{settings.llmError}</Alert>}
                  </CardContent>
              </Card>
              {supabase && (
                <Card className="bg-muted/60 border-border">
                  <CardHeader><CardTitle className="text-lg font-semibold flex items-center"><DatabaseZapIcon className="w-5 h-5 mr-2.5 text-primary"/>Knowledge Base Management</CardTitle><CardDescription>Bulk-upload historical mappings to the shared knowledge base.</CardDescription></CardHeader>
                  <CardContent className="space-y-4 pt-3">
                    <div className="p-4 bg-card rounded-lg border border-border/70 space-y-3">
                      <p className="text-sm font-medium">The global cloud knowledge base currently has <span className="font-bold text-primary">{mapping.knowledgeBaseCount !== null ? mapping.knowledgeBaseCount.toLocaleString() : '...'}</span> entries.</p>
                      <p className="text-xs text-muted-foreground">Upload a CSV/XLSX file with columns: <code>shory_make</code>, <code>shory_model</code>, <code>ic_make</code>, <code>ic_model</code>.</p>
                      <FileUpload id="knowledge-upload" label="Select Knowledge File" onFileUpload={setKnowledgeFile} disabled={mapping.isImportingKnowledge} />
                      {knowledgeFile && !mapping.isImportingKnowledge && (
                        <ActionButton onClick={() => mapping.handleImportKnowledgeBase(knowledgeFile)} disabled={mapping.isImportingKnowledge} className="w-full mt-2" icon={<DatabaseZapIcon/>}>Import to Knowledge Base</ActionButton>
                      )}
                      {mapping.isImportingKnowledge && mapping.knowledgeImportProgress && (
                        <div className="pt-2 space-y-3"><LoadingSpinner.Ring className="mx-auto" /><ProgressBar value={(mapping.knowledgeImportProgress.total > 0 ? (mapping.knowledgeImportProgress.current / mapping.knowledgeImportProgress.total) * 100 : 0)} label={mapping.knowledgeImportProgress.message} size="sm" /></div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card className="bg-muted/60 border-border">
                  <CardHeader><CardTitle className="text-lg font-semibold flex items-center"><SettingsIcon className="w-5 h-5 mr-2.5 text-primary"/>Matching Layer Configuration</CardTitle></CardHeader>
                  <CardContent className="space-y-4 pt-3">
                    <p className="text-xs text-muted-foreground">Layers run sequentially. Enable learning to improve accuracy over time.</p>
                    {[
                        {id: "useKnowledgeBaseLayer", label: "Cloud Knowledge Base", checked: settings.useKnowledgeBaseLayer, setter: settings.setUseKnowledgeBaseLayer, disabled: !supabase, note: !supabase ? '(Cloud Service Unavailable)' : `(Fastest, uses shared historical matches. ${mapping.knowledgeBaseCount !== null ? mapping.knowledgeBaseCount.toLocaleString() : '...'} entries found.)`},
                        {id: "useLearnedRulesLayer", label: "AI-Generated Rules", checked: settings.useLearnedRulesLayer, setter: settings.setUseLearnedRulesLayer, disabled: !supabase || !settings.llmProviderInstance, note: !supabase || !settings.llmProviderInstance ? '(AI/Cloud Service Unavailable)' : "(Fast, applies shared, auto-generated matching rules)"},
                        {id: "useFuzzyLayer", label: "Fuzzy Matching Layer", checked: settings.useFuzzyLayer, setter: settings.setUseFuzzyLayer, disabled: false, note: "(Fast, local text similarity for typos)"},
                        {id: "useAdvancedAiLayer", label: "Advanced AI Matching Layer", checked: settings.useAdvancedAiLayer, setter: settings.setUseAdvancedAiLayer, disabled: !settings.llmProviderInstance, note: !settings.llmProviderInstance ? '(AI Service Unavailable)' : "AI-powered semantic comparison, with web search for difficult matches (web search is Gemini-only)."},
                    ].map(layer => (
                        <div key={layer.id} className="flex items-center space-x-3 p-3.5 bg-card border border-border rounded-lg"><input id={layer.id} type="checkbox" checked={layer.checked} onChange={(e) => layer.setter(e.target.checked)} disabled={layer.disabled} className="form-checkbox"/><div className="flex-1"><label htmlFor={layer.id} className={`text-sm font-medium ${layer.disabled ? 'text-muted-foreground/70 cursor-not-allowed' : 'text-foreground cursor-pointer'}`}>{layer.label}</label><p className={`text-xs ${layer.disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>{layer.note}</p></div></div>
                    ))}
                  </CardContent>
              </Card>
              {settings.useFuzzyLayer && (
                <Card className="border-border">
                  <CardHeader><CardTitle className="text-lg font-semibold">Fuzzy Match Confidence</CardTitle></CardHeader>
                  <CardContent className="pt-3">
                    <div className="flex justify-between items-center mb-2"><label htmlFor="fuzzyThreshold" className="block text-sm font-medium text-foreground">Threshold</label><span className="font-semibold text-primary text-sm bg-primary/10 px-2.5 py-1 rounded-full">{Math.round(settings.fuzzyThreshold * 100)}%</span></div>
                    <input type="range" id="fuzzyThreshold" min="0.1" max="1" step="0.01" value={settings.fuzzyThreshold} onChange={(e) => settings.setFuzzyThreshold(parseFloat(e.target.value))} className="form-range w-full" disabled={isLoading}/>
                    <p className="text-xs text-muted-foreground mt-3">{settings.useAdvancedAiLayer ? "Matches below this threshold will proceed to the AI layer." : "Only matches at or above this threshold will be considered."}</p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
                <ActionButton variant="outline" onClick={() => mapping.setCurrentStep(AppStep.CONFIGURE_COLUMNS)} disabled={isLoading}>Back</ActionButton>
                <ActionButton onClick={mapping.handleProcessData} disabled={(!settings.useKnowledgeBaseLayer && !settings.useLearnedRulesLayer && !settings.useFuzzyLayer && !settings.useAdvancedAiLayer) || isLoading || !settings.llmProviderInstance} className="min-w-[190px]" variant="primary" icon={isLoading ? <LoadingSpinner.Ring className="h-4 w-4 text-primary-foreground" /> : <ArrowRightIcon />} iconPosition="right">{isLoading ? 'Processing...' : 'Start Mapping Process'}</ActionButton>
            </CardFooter>
          </Card>
        );
      case AppStep.SHOW_RESULTS:
        return (
          <Card className={`${animationClass} shadow-fluid-md`}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div><CardTitle>Mapping Results</CardTitle><CardDescription>Review the {mapping.mappedData.length} mapped vehicle records below.</CardDescription></div>
                <div className="flex-shrink-0 flex items-center gap-2">
                   <ActionButton variant="secondary" onClick={mapping.handleSaveSession} disabled={mapping.mappedData.length === 0 || isLoading || !supabase} icon={<SaveIcon />}>{mapping.currentSessionId ? 'Update Session' : 'Save Session'}</ActionButton>
                   <ActionButton variant="primary" onClick={() => downloadCSV(mapping.mappedData, mapping.shoryConfig, mapping.icConfig)} disabled={mapping.mappedData.length === 0 || isLoading} icon={<DownloadIcon />}>Download Results</ActionButton>
                </div>
              </div>
            </CardHeader>
            <CardContent>{mapping.mappedData.length > 0 ? <ResultsTable data={mapping.mappedData} shoryOutputColumns={mapping.shoryConfig.outputColumns} shoryMakeColumn={mapping.shoryConfig.make} shoryModelColumn={mapping.shoryConfig.model} icCodeColumns={mapping.icConfig.codes} /> : <Alert variant="info" title="No Results Yet">The mapping process has not produced any results to display.</Alert>}</CardContent>
            <CardFooter className="justify-start"><ActionButton variant="outline" onClick={() => mapping.setCurrentStep(AppStep.PROCESS_DATA)} disabled={isLoading}>Back to Parameters</ActionButton></CardFooter>
          </Card>
        );
      default:
        return <Alert variant="destructive" title="Error">Unknown step.</Alert>;
    }
  };

  const showResetButton = mapping.viewMode === 'mapping' && (mapping.currentStep > AppStep.UPLOAD_SHORY) && !isLoading;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-10 lg:p-12 flex flex-col items-center selection:bg-primary/20">
      <header className="w-full max-w-7xl mb-12 animate-slideDown">
        <div className="relative flex justify-center items-center py-2">
            <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl text-foreground">{APP_TITLE}</h1>
                <p className="mt-3 text-base sm:text-lg text-muted-foreground/80 max-w-3xl mx-auto">
                    Intelligently map vehicle data between files.
                </p>
            </div>
            {session && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Help and Documentation">
                  <ActionButton variant="secondary" size="sm" icon={<HelpCircleIcon />}>Help</ActionButton>
                </a>
                <ActionButton variant="outline" size="sm" onClick={handleSignOut} icon={<LogOutIcon />}>Sign Out</ActionButton>
              </div>
            )}
        </div>
      </header>
      <main className="w-full max-w-7xl space-y-10">
        {mapping.viewMode === 'mapping' && session && (
            <Card className="bg-card shadow-fluid-md animate-fadeIn animation-delay-200 overflow-hidden">
                <CardContent className="p-0 sm:p-0">
                    <ExpandableTabs tabs={EXPANDABLE_TABS_CONFIG} activeTabIdFromParent={mapping.currentStep.toString()} onTabClick={handleTabNavigation} className="w-full" />
                </CardContent>
            </Card>
        )}

        {error && (<Alert variant="destructive" title="An Error Occurred" className="animate-slideDown shadow-fluid-md">{error}</Alert>)}

        {isLoading && (mapping.viewMode === 'mapping' || mapping.currentStep === AppStep.PROCESS_DATA) ? ( 
          <Card className="shadow-fluid-md animate-fadeIn">
            <CardHeader><CardTitle>Processing...</CardTitle><CardDescription>{loadingMessage}</CardDescription></CardHeader>
            <CardContent className="py-20">
              <LoadingSpinner message={loadingMessage || "Analyzing records..."} />
              {progress && (<div className='mt-12'><ProgressBar value={(progress.total > 0 ? (progress.current / progress.total) * 100 : 0)} label={progress.message} /></div>)}
            </CardContent>
          </Card>
        ) : (
          renderContent()
        )}
        
        {showResetButton && (
          <div className="mt-16 text-center animate-fadeIn animation-delay-400">
            <ActionButton variant="link" onClick={() => mapping.resetApp()} icon={<RestartIcon />} className="text-sm text-muted-foreground hover:text-destructive">
              {mapping.sessions.length > 0 ? 'Reset and View Sessions' : 'Reset and Start Over'}
            </ActionButton>
          </div>
        )}
      </main>
      <footer className="w-full max-w-7xl mt-24 py-10 border-t border-border text-center animate-fadeIn animation-delay-600">
          <p className="text-xs text-muted-foreground/70">&copy; {new Date().getFullYear()} {APP_TITLE}. All rights reserved.</p>
      </footer>
    </div>
  );
};

const App = () => (
  <DialogProvider>
    <AuthProvider>
      <SettingsProvider>
        <MappingProvider>
          <AppCore />
        </MappingProvider>
      </SettingsProvider>
    </AuthProvider>
  </DialogProvider>
);

export default App;
