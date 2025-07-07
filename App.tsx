


import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
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
  MatchStatus,
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
import { MappingService } from './services/mappingService';
import { downloadCSV } from './services/csvExporter';
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
import { findErrorDetails } from './services/apiErrorData';
import ApiErrorDialog from './components/ApiErrorDialog';

// --- State Management using useReducer ---
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

const initialState: AppState = {
  isLoading: false,
  loadingMessage: '',
  error: null,
  progress: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_LOADING':
      return { ...state, isLoading: true, loadingMessage: action.payload.message, error: null };
    case 'STOP_LOADING':
      return { ...state, isLoading: false, loadingMessage: '' };
    case 'SET_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'START_PROCESS':
      return { isLoading: true, loadingMessage: action.payload.message, error: null, progress: { current: 0, total: action.payload.total, message: "Initializing..." }};
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    default:
      return state;
  }
}

const AppCore = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { isLoading, loadingMessage, error, progress } = state;
  const { alert, prompt } = useDialog();
  
  const [session, setSession] = useState<Session | null>(null);
  const [appReady, setAppReady] = useState<boolean>(false);
  
  const [viewMode, setViewMode] = useState<'auth' | 'welcome' | 'mapping'>('auth');
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.UPLOAD_SHORY);
  
  const [shoryFile, setShoryFile] = useState<FileData | null>(null);
  const [icFile, setIcFile] = useState<FileData | null>(null);

  const [shoryConfig, setShoryConfig] = useState<ShoryColumnConfig>({ make: '', model: '', outputColumns: [] });
  const [icConfig, setIcConfig] = useState<ICColumnConfig>({ make: '', model: '', codes: [] });
  
  const [fuzzyThreshold, setFuzzyThreshold] = useState<number>(FUZZY_THRESHOLD_DEFAULT);
  const [mappedData, setMappedData] = useState<MappedRecord[]>([]);
  
  // --- LLM Provider State ---
  const [llmProviderInstance, setLlmProviderInstance] = useState<LlmProvider | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmProviderType, setLlmProviderType] = useState<LlmProviderType>('gemini');
  const [customLlmApiKey, setCustomLlmApiKey] = useState<string>('');
  const [customLlmModel, setCustomLlmModel] = useState<string>(CUSTOM_LLM_DEFAULT_MODEL);
  const [activeModel, setActiveModel] = useState<string>(GEMINI_MODEL_TEXT);
  // --- End LLM Provider State ---

  const [sessionServiceInstance] = useState<SessionService | null>(() => supabase ? new SessionService() : null);
  const [sessions, setSessions] = useState<MappingSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // --- Knowledge Base State ---
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);
  const [isImportingKnowledge, setIsImportingKnowledge] = useState<boolean>(false);
  const [knowledgeImportProgress, setKnowledgeImportProgress] = useState<{current: number, total: number, message: string} | null>(null);
  const [knowledgeBaseCount, setKnowledgeBaseCount] = useState<number | null>(null);
  // --- End Knowledge Base State ---

  const [useKnowledgeBaseLayer, setUseKnowledgeBaseLayer] = useState<boolean>(true);
  const [useLearnedRulesLayer, setUseLearnedRulesLayer] = useState<boolean>(true);
  const [useFuzzyLayer, setUseFuzzyLayer] = useState<boolean>(true);
  const [useAdvancedAiLayer, setUseAdvancedAiLayer] = useState<boolean>(true);

  // --- Performance Optimization for High-Frequency Updates & Background Stability ---
  // These refs hold the "live" data model updated by the background process.
  const processingDataRef = useRef<{ data: MappedRecord[], needsUpdate: boolean }>({ data: [], needsUpdate: false });
  const progressRef = useRef<AppState['progress'] | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
      let animationFrameId: number;

      // This function runs on every animation frame when the tab is active.
      const syncUiWithDataModel = () => {
          if (!isProcessingRef.current) return; // Stop the loop if processing is finished.

          // Sync the progress bar state if there's a new update.
          if (progressRef.current) {
              dispatch({ type: 'SET_PROGRESS', payload: progressRef.current });
              progressRef.current = null;
          }

          // Sync the table data state if there's a new update.
          // This is the key: we only update state when the background process signals that it has changed the data.
          if (processingDataRef.current.needsUpdate) {
              setMappedData([...processingDataRef.current.data]); // Update React state with a copy of the live data
              processingDataRef.current.needsUpdate = false; // Reset the flag
          }

          // Continue the loop for the next frame.
          animationFrameId = requestAnimationFrame(syncUiWithDataModel);
      };

      // Start the loop only when processing is active.
      if (isProcessingRef.current) {
          animationFrameId = requestAnimationFrame(syncUiWithDataModel);
      }

      // Cleanup function to cancel the loop when the component unmounts or processing stops.
      return () => {
          cancelAnimationFrame(animationFrameId);
      };
  }, [isProcessingRef.current]); // This effect re-runs only when processing starts or stops.
  // --- End Performance Optimization ---

  useEffect(() => {
    const savedApiKey = sessionStorage.getItem('customLlmApiKey');
    const savedModel = sessionStorage.getItem('customLlmModel');
    if (savedApiKey) setCustomLlmApiKey(savedApiKey);
    if (savedModel) setCustomLlmModel(savedModel);
    
    if (supabase) {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAppReady(true);
        }).catch(err => {
            console.error("Error getting session:", err);
            dispatch({ type: 'SET_ERROR', payload: "Could not connect to authentication service." });
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

  useEffect(() => {
    setLlmError(null);
    setLlmProviderInstance(null);
    try {
      if (!supabase) {
        throw new Error("Supabase client is not available. AI providers requiring a secure proxy cannot be used.");
      }
      if (llmProviderType === 'gemini') {
        const geminiInstance = new GeminiProvider(supabase);
        setLlmProviderInstance(geminiInstance);
        setActiveModel(GEMINI_MODEL_TEXT);
        setUseAdvancedAiLayer(true);
      } else if (llmProviderType === 'custom') {
        if (!customLlmApiKey || !customLlmModel) {
            throw new Error("API Key and Model are required for Custom LLM.");
        }
        const customInstance = new CustomProvider(customLlmApiKey, customLlmModel, supabase);
        setLlmProviderInstance(customInstance);
        setActiveModel(customLlmModel);
        setUseAdvancedAiLayer(true);
      }
    } catch (e: any) {
      const message = `AI Service Unavailable: ${e.message}`;
      setLlmError(message);
      setUseAdvancedAiLayer(false);
    }
  }, [llmProviderType, customLlmApiKey, customLlmModel]);
  
  const fetchKnowledgeBaseCount = useCallback(async () => {
    if (session && sessionServiceInstance) {
      const count = await sessionServiceInstance.getKnowledgeBaseCount();
      setKnowledgeBaseCount(count);
    }
  }, [session, sessionServiceInstance]);

  useEffect(() => {
    // If a mapping process is running in the background, we must not interrupt its UI state
    // by re-fetching sessions. A token refresh might trigger this effect, but the UI
    // should remain focused on the mapping progress.
    if (isProcessingRef.current) {
      return;
    }

    if (session && sessionServiceInstance) {
        dispatch({ type: 'START_LOADING', payload: { message: "Loading sessions..." } });
        Promise.all([
          sessionServiceInstance.getSessions(session.user.id),
          fetchKnowledgeBaseCount()
        ]).then(([savedSessions]) => {
            setSessions(savedSessions);
            // Only set the view mode on initial load. Don't flip back to 'welcome'
            // if the user is already deep in the mapping flow.
            if (currentStep <= AppStep.UPLOAD_SHORY) {
               setViewMode(savedSessions.length > 0 ? 'welcome' : 'mapping');
            }
        }).catch((err) => {
            dispatch({ type: 'SET_ERROR', payload: `Failed to load sessions: ${err.message}. Please ensure database tables are set up correctly.` });
        }).finally(() => {
            dispatch({ type: 'STOP_LOADING' });
        });
    } else {
        setViewMode('auth');
    }
  }, [session, sessionServiceInstance, fetchKnowledgeBaseCount, currentStep]);

  const handleFileUpload = async (file: File, type: 'shory' | 'ic') => {
    dispatch({ type: 'START_LOADING', payload: { message: `Parsing ${file.name}...` } });
    try {
      const parsedData = await parseFile(file);
      if (type === 'shory') {
        setShoryFile(parsedData);
        setShoryConfig(prev => ({ 
            ...prev, 
            make: parsedData.headers.find(h => h.toLowerCase().includes('make') || h.toLowerCase().includes('brand')) || '', 
            model: parsedData.headers.find(h => h.toLowerCase().includes('model')) || '',
            outputColumns: parsedData.headers 
        }));
        setCurrentStep(AppStep.UPLOAD_IC);
      } else {
        setIcFile(parsedData);
        setIcConfig(prev => ({ 
            ...prev, 
            make: parsedData.headers.find(h => h.toLowerCase().includes('make') || h.toLowerCase().includes('brand')) || '', 
            model: parsedData.headers.find(h => h.toLowerCase().includes('model')) || '', 
            codes: parsedData.headers.filter(h => h.toLowerCase().includes('code') || h.toLowerCase().includes('id')).slice(0,1)
        }));
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
    if (!useFuzzyLayer && !useAdvancedAiLayer && !useKnowledgeBaseLayer && !useLearnedRulesLayer) {
      dispatch({ type: 'SET_ERROR', payload: "Please enable at least one matching layer." });
      return;
    }
    if (!llmProviderInstance) {
        dispatch({ type: 'SET_ERROR', payload: "AI Provider is not configured correctly. Please check your settings in the Parameters step." });
        return;
    }

    dispatch({ type: 'START_PROCESS', payload: { message: 'Preparing data for mapping...', total: shoryFile.records.length }});

    // Initialize mappedData with placeholders
    const shoryRecordsWithId: ShoryRecord[] = shoryFile.records.map((r, i) => ({ ...r, __id: `shory-${i}`}));
    const initialMappedData: MappedRecord[] = shoryRecordsWithId.map(rec => ({
      ...rec,
      matchStatus: MatchStatus.NOT_PROCESSED
    }));
    setMappedData(initialMappedData); // Initial render with placeholders

    // --- NEW: Reset and start processing loop ---
    // Set up the live data model in the ref.
    processingDataRef.current = { data: [...initialMappedData], needsUpdate: false };
    progressRef.current = null;
    isProcessingRef.current = true; // This will trigger the useEffect to start the UI polling loop.

    const icRecordsWithId: ICRecord[] = icFile.records.map((r, i) => ({ ...r, __id: `ic-${i}`}));
    
    const mappingService = new MappingService(llmProviderInstance);
    
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
            dispatch({ type: 'STOP_LOADING' }); // Stop loading as the process can't continue
            return;
        }
    }

    try {
      const results = await mappingService.mapData(
        shoryRecordsWithId, icRecordsWithId, shoryConfig, icConfig, fuzzyThreshold,
        useKnowledgeBaseLayer, useLearnedRulesLayer, useFuzzyLayer, useAdvancedAiLayer, knowledgeBase, learnedRules,
        (processedRecord, currentIndex, total) => { 
            // This callback is now super lightweight and decouples the background process from React state.

            // 1. Find and update the record in our "live" in-memory data model (the ref).
            const recordIndex = processingDataRef.current.data.findIndex(r => r.__id === processedRecord.__id);
            if (recordIndex !== -1) {
                processingDataRef.current.data[recordIndex] = processedRecord;
            } else {
                // This case shouldn't happen if IDs are correct, but as a fallback:
                processingDataRef.current.data.push(processedRecord);
            }
            
            // 2. Signal to the UI polling loop that there's a new update to render.
            processingDataRef.current.needsUpdate = true;
            
            // 3. Update the progress ref.
            const percentage = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
            progressRef.current = {
                current: currentIndex + 1, 
                total: total, 
                message: `Processed ${currentIndex + 1} of ${total} (${percentage.toFixed(0)}%)`
            };
        }
      );
      
      // After mapping is done, set the final, authoritative data from the results array.
      setMappedData(results);
      
      if (session && sessionServiceInstance && llmProviderInstance) {
          dispatch({ type: 'START_LOADING', payload: { message: "AI is learning from this session..." } });
          await mappingService.performLearning(
              results, icConfig,
              llmProviderInstance, sessionServiceInstance,
              { knowledgeBase: useKnowledgeBaseLayer, rules: useLearnedRulesLayer }
          );
          await fetchKnowledgeBaseCount();
      }

      setCurrentStep(AppStep.SHOW_RESULTS);
    } catch (err: any) {
      const errorMessage = err.message || "An unknown error occurred during mapping.";
      const specificErrorDetail = findErrorDetails(errorMessage);
      
      isProcessingRef.current = false;
      dispatch({ type: 'STOP_LOADING' });

      if (specificErrorDetail) {
        await alert({
          title: 'API Error Occurred',
          message: <ApiErrorDialog errorDetail={specificErrorDetail} />,
          confirmText: 'Acknowledge',
        });
      } else {
        await alert({
          title: 'An Unexpected Error Occurred',
          message: `The mapping process was interrupted, preventing further records from being processed. You can view any partially processed results. Details: ${errorMessage}`,
          confirmText: 'Acknowledge',
          variant: 'destructive',
        });
      }
      
      // Navigate to the results page to show the partial data
      setCurrentStep(AppStep.SHOW_RESULTS);
    } finally {
      // --- NEW: Stop the UI polling loop ---
      isProcessingRef.current = false;
      dispatch({ type: 'STOP_LOADING' });
    }
  };

  const handleImportKnowledgeBase = async () => {
    if (!knowledgeFile || !sessionServiceInstance || !session) {
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
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new Error(`Invalid file format. Missing required columns: ${missingHeaders.join(', ')}`);
      }
      
      setKnowledgeImportProgress({ current: 0, total: records.length, message: "Normalizing records..." });
      
      const newKnowledge = new Map<string, KnowledgeBaseEntry[]>();
      for (const record of records) {
        const shoryMake = normalizeText(record.shory_make as string | number);
        const shoryModel = normalizeText(record.shory_model as string | number);
        const icMake = normalizeText(record.ic_make as string | number);
        const icModel = normalizeText(record.ic_model as string | number);
        
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
      
      const onProgress: ProgressCallback = (processed, total, message) => {
        setKnowledgeImportProgress({ current: processed, total, message });
      };

      const totalUniqueMappings = Array.from(newKnowledge.values()).reduce((sum, arr) => sum + arr.length, 0);

      await sessionServiceInstance.bulkAddToKnowledgeBase(newKnowledge, onProgress);
      await fetchKnowledgeBaseCount();
      await alert({
        title: 'Import Successful',
        message: `Successfully processed ${records.length} records. Imported ${totalUniqueMappings} unique mappings into the global knowledge base.`,
      });

    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: `Error importing knowledge base: ${err.message}` });
    } finally {
      setIsImportingKnowledge(false);
      setKnowledgeImportProgress(null);
      setKnowledgeFile(null);
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
        await supabase.auth.signOut();
        setSession(null);
        resetApp(true);
        setViewMode('auth');
    }
  }

  const resetApp = useCallback((startNew: boolean = false) => {
    setCurrentStep(AppStep.UPLOAD_SHORY);
    setShoryFile(null); setIcFile(null);
    setShoryConfig({ make: '', model: '', outputColumns: [] });
    setIcConfig({ make: '', model: '', codes: [] });
    setFuzzyThreshold(FUZZY_THRESHOLD_DEFAULT);
    setMappedData([]);
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'STOP_LOADING' });
    setCurrentSessionId(null);
    
    setLlmProviderType('gemini');
    setUseKnowledgeBaseLayer(!!sessionServiceInstance); 
    setUseLearnedRulesLayer(!!sessionServiceInstance);
    setUseFuzzyLayer(true);
    setUseAdvancedAiLayer(true); 
    
    if (!startNew && sessions.length > 0) {
        setViewMode('welcome');
    } else {
        setViewMode('mapping');
    }
  }, [sessions, sessionServiceInstance]);
  
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
          name: sessionName, shoryFile, icFile, shoryConfig, icConfig, mappedData, fuzzyThreshold,
          useFuzzyLayer, useAdvancedAiLayer, useKnowledgeBaseLayer, useLearnedRulesLayer,
          llmConfig: {
              provider: llmProviderType,
              model: activeModel,
          }
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
    if (sessionToLoad) {
      setCurrentSessionId(sessionToLoad.id); setShoryFile(sessionToLoad.shoryFile);
      setIcFile(sessionToLoad.icFile); setShoryConfig(sessionToLoad.shoryConfig);
      setIcConfig(sessionToLoad.icConfig); setMappedData(sessionToLoad.mappedData);
      setFuzzyThreshold(sessionToLoad.fuzzyThreshold); setUseFuzzyLayer(sessionToLoad.useFuzzyLayer);
      setUseAdvancedAiLayer(sessionToLoad.useAdvancedAiLayer);
      setUseKnowledgeBaseLayer(sessionToLoad.useKnowledgeBaseLayer);
      setUseLearnedRulesLayer(sessionToLoad.useLearnedRulesLayer);

      setLlmProviderType(sessionToLoad.llmConfig.provider);
      if (sessionToLoad.llmConfig.provider === 'custom') {
        setCustomLlmModel(sessionToLoad.llmConfig.model);
      }
      
      dispatch({ type: 'SET_ERROR', payload: null });
      dispatch({ type: 'STOP_LOADING' });
      setCurrentStep(AppStep.SHOW_RESULTS); setViewMode('mapping');
    }
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
  
  const EXPANDABLE_TABS_CONFIG: TabItem[] = STEPS_CONFIG.map(step => ({
        id: step.id.toString(),
        icon: [FileUp, FilePlus2, ListChecks, Settings2, Table2][step.id-1],
        label: step.title,
        color: ['bg-primary', 'bg-blue-700', 'bg-sky-600', 'bg-indigo-500', 'bg-slate-600'][step.id-1],
  }));

  const handleTabNavigation = (tabId: string) => {
    const targetStepId = parseInt(tabId, 10);
    if (targetStepId <= currentStep) setCurrentStep(targetStepId as AppStep);
  };
  
  const renderContent = () => {
    if (!appReady) return <Card className="shadow-fluid-md animate-fadeIn"><CardContent className="py-20"><LoadingSpinner message="Initializing application..." /></CardContent></Card>;

    if (!session) return <Auth />;

    if (isLoading && viewMode !== 'mapping') {
        return <Card className="shadow-fluid-md animate-fadeIn"><CardContent className="py-20"><LoadingSpinner message={loadingMessage} /></CardContent></Card>;
    }
    
    if (viewMode === 'welcome') {
      return (
        <SessionManager
          sessions={sessions}
          onLoad={(id) => { const session = sessions.find(s=>s.id === id); if(session) handleLoadSession(session); }}
          onDelete={handleDeleteSession}
          onNewSession={handleStartNewSession}
        />
      );
    }
    
    const animationClass = "animate-fadeIn";
    switch (currentStep) {
      case AppStep.UPLOAD_SHORY:
        return (
          <Card className={`${animationClass} shadow-fluid-md`}>
            <CardHeader><CardTitle>Upload Shory Vehicle Data</CardTitle><CardDescription>Select the CSV or XLSX file containing Shory vehicle information.</CardDescription></CardHeader>
            <CardContent><FileUpload id="shory-upload" label="Shory File (CSV/XLSX)" onFileUpload={(file) => handleFileUpload(file, 'shory')} disabled={isLoading}/></CardContent>
          </Card>
        );
      case AppStep.UPLOAD_IC:
        return (
          <Card className={`${animationClass} shadow-fluid-md`}>
            <CardHeader><CardTitle>Upload Insurance Company Data</CardTitle><CardDescription>Select the CSV or XLSX file provided by the Insurance Company.</CardDescription></CardHeader>
            <CardContent>
              {shoryFile && <Alert variant="info" title="Shory File Loaded" className="mb-6 text-sm">{shoryFile.name}</Alert>}
              <FileUpload id="ic-upload" label="Insurance Co. File (CSV/XLSX)" onFileUpload={(file) => handleFileUpload(file, 'ic')} disabled={isLoading}/>
            </CardContent>
             <CardFooter className="justify-start"><ActionButton variant="outline" onClick={() => setCurrentStep(AppStep.UPLOAD_SHORY)}>Back</ActionButton></CardFooter>
          </Card>
        );
      case AppStep.CONFIGURE_COLUMNS:
        if (!shoryFile || !icFile) return <Alert variant="destructive" title="File Error">Files not loaded correctly. Please start over.</Alert>;
        return (
          <div className={`${animationClass} space-y-8`}>
            <Card className="shadow-fluid-md">
                <CardHeader><CardTitle>Configure Data Columns</CardTitle><CardDescription>Define column mappings for accurate matching.</CardDescription></CardHeader>
                <CardContent className="space-y-8">
                    <Alert variant="info" className="text-sm"><p className="font-semibold mb-1.5">Files Ready:</p><ul className="list-disc list-inside text-muted-foreground space-y-1"><li>Shory: {shoryFile.name} ({shoryFile.records.length} records)</li><li>IC: {icFile.name} ({icFile.records.length} records)</li></ul></Alert>
                    <ColumnSelector idPrefix="shory" title="Shory File Configuration" headers={shoryFile.headers} selectedMake={shoryConfig.make} selectedModel={shoryConfig.model} onMakeChange={(val) => setShoryConfig(prev => ({ ...prev, make: val }))} onModelChange={(val) => setShoryConfig(prev => ({ ...prev, model: val }))} additionalColumns={shoryFile.headers} selectedAdditionalColumns={shoryConfig.outputColumns} onAdditionalColumnsChange={(cols) => setShoryConfig(prev => ({...prev, outputColumns: cols}))} />
                    <ColumnSelector idPrefix="ic" title="Insurance Company File Configuration" headers={icFile.headers} selectedMake={icConfig.make} selectedModel={icConfig.model} onMakeChange={(val) => setIcConfig(prev => ({ ...prev, make: val }))} onModelChange={(val) => setIcConfig(prev => ({ ...prev, model: val }))} selectedCodes={icConfig.codes} onCodesChange={(selectedCodes) => setIcConfig(prev => ({...prev, codes: selectedCodes}))} />
                </CardContent>
                <CardFooter className="flex justify-between">
                    <ActionButton variant="outline" onClick={() => setCurrentStep(AppStep.UPLOAD_IC)}>Back</ActionButton>
                    <ActionButton onClick={() => setCurrentStep(AppStep.PROCESS_DATA)} disabled={!shoryConfig.make || !shoryConfig.model || !icConfig.make || !icConfig.model} icon={<ArrowRightIcon />} iconPosition="right">Next: Parameters</ActionButton>
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
                          <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="llmProvider" value="gemini" checked={llmProviderType === 'gemini'} onChange={() => setLlmProviderType('gemini')} className="form-radio text-primary" /> <span>Google Gemini</span></label>
                          <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="llmProvider" value="custom" checked={llmProviderType === 'custom'} onChange={() => setLlmProviderType('custom')} className="form-radio text-primary" /> <span>Custom LLM (Groq)</span></label>
                      </div>
                      {llmProviderType === 'custom' && (
                          <div className="p-4 bg-card border rounded-lg space-y-3 mt-3 animate-fadeIn">
                              <Alert variant="info" title="Proxy Configuration Note">
                                Custom providers now use a secure backend proxy. For this to work, you must deploy the <code>proxy-llm</code> Edge Function in your Supabase project.
                              </Alert>
                              <div><label className="text-sm font-medium text-foreground" htmlFor="custom-api-key">API Key (e.g., from Groq)</label><input id="custom-api-key" type="password" value={customLlmApiKey} onChange={(e) => {setCustomLlmApiKey(e.target.value); sessionStorage.setItem('customLlmApiKey', e.target.value);}} className="form-input w-full mt-1.5" placeholder="Enter your custom provider API key"/></div>
                              <div><label className="text-sm font-medium text-foreground" htmlFor="custom-model">Model Name</label><input id="custom-model" type="text" value={customLlmModel} onChange={(e) => {setCustomLlmModel(e.target.value); sessionStorage.setItem('customLlmModel', e.target.value);}} className="form-input w-full mt-1.5" placeholder="e.g., llama3-8b-8192"/></div>
                          </div>
                      )}
                      {llmError && <Alert variant="destructive" title="AI Provider Error" className="mt-3">{llmError}</Alert>}
                  </CardContent>
              </Card>

              {sessionServiceInstance && (
                <Card className="bg-muted/60 border-border">
                  <CardHeader>
                      <CardTitle className="text-lg font-semibold flex items-center"><DatabaseZapIcon className="w-5 h-5 mr-2.5 text-primary"/>Knowledge Base Management</CardTitle>
                      <CardDescription>Bulk-upload historical mappings to the shared knowledge base.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-3">
                    <div className="p-4 bg-card rounded-lg border border-border/70 space-y-3">
                      <p className="text-sm font-medium">The global cloud knowledge base currently has <span className="font-bold text-primary">{knowledgeBaseCount !== null ? knowledgeBaseCount.toLocaleString() : '...'}</span> entries.</p>
                      <p className="text-xs text-muted-foreground">Upload a CSV/XLSX file with columns: <code>shory_make</code>, <code>shory_model</code>, <code>ic_make</code>, <code>ic_model</code>. This will add to or update existing entries.</p>
                      <FileUpload id="knowledge-upload" label="Select Knowledge File" onFileUpload={setKnowledgeFile} disabled={isImportingKnowledge} />
                      {knowledgeFile && !isImportingKnowledge && (
                        <ActionButton onClick={handleImportKnowledgeBase} disabled={isImportingKnowledge} className="w-full mt-2" icon={<DatabaseZapIcon/>}>
                          Import to Knowledge Base
                        </ActionButton>
                      )}
                      {isImportingKnowledge && knowledgeImportProgress && (
                        <div className="pt-2 space-y-3">
                          <LoadingSpinner.Ring className="mx-auto" />
                          <ProgressBar value={(knowledgeImportProgress.total > 0 ? (knowledgeImportProgress.current / knowledgeImportProgress.total) * 100 : 0)} label={knowledgeImportProgress.message} size="sm" />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-muted/60 border-border">
                  <CardHeader><CardTitle className="text-lg font-semibold flex items-center"><SettingsIcon className="w-5 h-5 mr-2.5 text-primary"/>Matching Layer Configuration</CardTitle></CardHeader>
                  <CardContent className="space-y-4 pt-3">
                    <p className="text-xs text-muted-foreground">Layers run sequentially on unmatched records. Enable learning layers to improve accuracy over time.</p>
                    {[
                        {id: "useKnowledgeBaseLayer", label: "Cloud Knowledge Base", checked: useKnowledgeBaseLayer, setter: setUseKnowledgeBaseLayer, disabled: !sessionServiceInstance, note: !sessionServiceInstance ? '(Cloud Service Unavailable)' : `(Fastest, uses shared historical matches from all users. ${knowledgeBaseCount !== null ? knowledgeBaseCount.toLocaleString() : '...'} entries found.)`},
                        {id: "useLearnedRulesLayer", label: "AI-Generated Rules", checked: useLearnedRulesLayer, setter: setUseLearnedRulesLayer, disabled: !sessionServiceInstance || !llmProviderInstance, note: !sessionServiceInstance || !llmProviderInstance ? '(AI/Cloud Service Unavailable)' : "(Fast, applies shared, validated matching rules)"},
                        {id: "useFuzzyLayer", label: "Fuzzy Matching Layer", checked: useFuzzyLayer, setter: setUseFuzzyLayer, disabled: false, note: "(Fast, local text similarity for typos)"},
                        {id: "useAdvancedAiLayer", label: "Advanced AI Matching Layer", checked: useAdvancedAiLayer, setter: setUseAdvancedAiLayer, disabled: !llmProviderInstance, note: !llmProviderInstance ? '(AI Service Unavailable)' : "AI-powered semantic comparison, with web search for difficult matches (web search is Gemini-only)."},
                    ].map(layer => (
                        <div key={layer.id} className="flex items-center space-x-3 p-3.5 bg-card border border-border rounded-lg"><input id={layer.id} type="checkbox" checked={layer.checked} onChange={(e) => layer.setter(e.target.checked)} disabled={layer.disabled} className="form-checkbox"/><div className="flex-1"><label htmlFor={layer.id} className={`text-sm font-medium ${layer.disabled ? 'text-muted-foreground/70 cursor-not-allowed' : 'text-foreground cursor-pointer'}`}>{layer.label}</label><p className={`text-xs ${layer.disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>{layer.note}</p></div></div>
                    ))}
                  </CardContent>
              </Card>
              {useFuzzyLayer && (
                <Card className="border-border">
                  <CardHeader><CardTitle className="text-lg font-semibold">Fuzzy Match Confidence</CardTitle></CardHeader>
                  <CardContent className="pt-3">
                    <div className="flex justify-between items-center mb-2"><label htmlFor="fuzzyThreshold" className="block text-sm font-medium text-foreground">Threshold</label><span className="font-semibold text-primary text-sm bg-primary/10 px-2.5 py-1 rounded-full">{Math.round(fuzzyThreshold * 100)}%</span></div>
                    <input type="range" id="fuzzyThreshold" min="0.1" max="1" step="0.01" value={fuzzyThreshold} onChange={(e) => setFuzzyThreshold(parseFloat(e.target.value))} className="form-range w-full" disabled={isLoading}/>
                    <p className="text-xs text-muted-foreground mt-3">{useAdvancedAiLayer ? "Matches below this threshold will proceed to the AI layer." : "Only matches at or above this threshold will be considered."}</p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
                <ActionButton variant="outline" onClick={() => setCurrentStep(AppStep.CONFIGURE_COLUMNS)} disabled={isLoading}>Back</ActionButton>
                <ActionButton onClick={handleProcessData} disabled={(!useKnowledgeBaseLayer && !useLearnedRulesLayer && !useFuzzyLayer && !useAdvancedAiLayer) || isLoading || !llmProviderInstance} className="min-w-[190px]" variant="primary" icon={isLoading ? <LoadingSpinner.Ring className="h-4 w-4 text-primary-foreground" /> : <ArrowRightIcon />} iconPosition="right">{isLoading ? 'Processing...' : 'Start Mapping Process'}</ActionButton>
            </CardFooter>
          </Card>
        );
      case AppStep.SHOW_RESULTS:
        return (
          <Card className={`${animationClass} shadow-fluid-md`}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div><CardTitle>Mapping Results</CardTitle><CardDescription>Review the {mappedData.length} mapped vehicle records below.</CardDescription></div>
                <div className="flex-shrink-0 flex items-center gap-2">
                   <ActionButton variant="secondary" onClick={handleSaveSession} disabled={mappedData.length === 0 || isLoading || !sessionServiceInstance} icon={<SaveIcon />}>{currentSessionId ? 'Update Session' : 'Save Session'}</ActionButton>
                   <ActionButton variant="primary" onClick={() => downloadCSV(mappedData, shoryConfig, icConfig)} disabled={mappedData.length === 0 || isLoading} icon={<DownloadIcon />}>Download Results</ActionButton>
                </div>
              </div>
            </CardHeader>
            <CardContent>{mappedData.length > 0 ? <ResultsTable data={mappedData} shoryOutputColumns={shoryConfig.outputColumns} shoryMakeColumn={shoryConfig.make} shoryModelColumn={shoryConfig.model} icCodeColumns={icConfig.codes} /> : <Alert variant="info" title="No Results Yet">The mapping process has not produced any results to display.</Alert>}</CardContent>
            <CardFooter className="justify-start"><ActionButton variant="outline" onClick={() => setCurrentStep(AppStep.PROCESS_DATA)} disabled={isLoading}>Back to Parameters</ActionButton></CardFooter>
          </Card>
        );
      default:
        return <Alert variant="destructive" title="Error">Unknown step.</Alert>;
    }
  };

  const showResetButton = viewMode === 'mapping' && (currentStep > AppStep.UPLOAD_SHORY) && !isLoading;

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
        {viewMode === 'mapping' && session && (
            <Card className="bg-card shadow-fluid-md animate-fadeIn animation-delay-200 overflow-hidden">
                <CardContent className="p-0 sm:p-0">
                    <ExpandableTabs tabs={EXPANDABLE_TABS_CONFIG} activeTabIdFromParent={currentStep.toString()} onTabClick={handleTabNavigation} className="w-full" />
                </CardContent>
            </Card>
        )}

        {error && (<Alert variant="destructive" title="An Error Occurred" className="animate-slideDown shadow-fluid-md">{error}</Alert>)}

        {isLoading && (viewMode === 'mapping' || currentStep === AppStep.PROCESS_DATA) ? ( 
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
            <ActionButton variant="link" onClick={() => resetApp()} icon={<RestartIcon />} className="text-sm text-muted-foreground hover:text-destructive">
              {sessions.length > 0 ? 'Reset and View Sessions' : 'Reset and Start Over'}
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
    <AppCore />
  </DialogProvider>
);

export default App;
