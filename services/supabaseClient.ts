

import { createClient } from '@supabase/supabase-js';

// --- IMPORTANT: UPDATE YOUR CREDENTIALS HERE ---
// Replace the placeholder values below with your actual Supabase project URL and public anon key.
// You can find these in your Supabase project settings under "API".
// Using environment variables is the best practice for production projects.
const YOUR_SUPABASE_URL = 'https://vctxouvusyyqjobhrooa.supabase.co';
const YOUR_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHhvdXZ1c3l5cWpvYmhyb29hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxNTczMDcsImV4cCI6MjA2NTczMzMwN30.WqGjRpsMPuWTJLM8kBRQD_JfcYsx4lHq5Pyg7pcoxSw';

// The application will try to use Vite environment variables first, then fall back to the constants above.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || YOUR_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || YOUR_SUPABASE_ANON_KEY;


let supabaseClient = null;

if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('PASTE_YOUR_SUPABASE_URL_HERE')) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
} else {
    // Log a clear error message but don't throw, allowing the app to run in a limited, non-cloud state.
    console.error(`
      ------------------------------------------------------------------
      Supabase credentials are not configured correctly.
      Cloud features (saving sessions, knowledge base) will be disabled.
      
      To fix this, either set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
      as environment variables, or update the placeholder values in
      'services/supabaseClient.ts'.
      ------------------------------------------------------------------
    `);
}

// All AI API key checks are now handled on the server-side via the proxy function.

export const supabase = supabaseClient;
export { supabaseUrl }; // Export for use in other services