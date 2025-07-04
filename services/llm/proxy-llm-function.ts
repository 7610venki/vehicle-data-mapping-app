// @ts-nocheck

// Deno-deploy-specific imports
// This is the single, unified proxy for all LLM providers.
// Paste this code into the `proxy-llm` Edge Function in your Supabase dashboard.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provider-api-key',
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { ...CORS_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    });
  }

  try {
    const { provider, model, prompt, tools, responseMimeType } = await req.json();

    if (!provider || !model || !prompt) {
      return new Response(JSON.stringify({ error: 'Request body must contain "provider", "model", and "prompt".' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    let apiResponse;
    let responseBody;

    if (provider === 'gemini') {
      const geminiApiKeysString = Deno.env.get('GEMINI_API_KEYS');
      if (!geminiApiKeysString) {
        return new Response(JSON.stringify({ error: 'Gemini API keys are not configured on the server. Please set the GEMINI_API_KEYS environment variable in your Supabase project settings.' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
      
      const geminiApiKeys = geminiApiKeysString.split(',').map(k => k.trim()).filter(Boolean);
      if (geminiApiKeys.length === 0) {
        return new Response(JSON.stringify({ error: 'The GEMINI_API_KEYS environment variable is empty or incorrectly formatted. Please provide a comma-separated list of keys.' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      // This is the generationConfig object for the raw REST API call.
      const generationConfig: {
        temperature: number;
        maxOutputTokens: number;
        responseMimeType?: string;
      } = {
        temperature: 0.2,
        maxOutputTokens: 8192,
      };

      // Per the latest guidelines, do not send responseMimeType when tools are used (e.g., googleSearch).
      if (!tools) {
        generationConfig.responseMimeType = responseMimeType || 'application/json';
      }

      // The raw Gemini REST API payload uses a 'generationConfig' object.
      // The '@google/genai' SDK abstracts this to 'config', but we're making a direct fetch call.
      const geminiPayload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: generationConfig, // Use 'generationConfig' for raw REST API calls
        ...(tools && { tools: tools }),
      };
      
      let lastError = null;

      for (const apiKey of geminiApiKeys) {
        // The endpoint uses the v1beta model name and the standard generateContent action.
        const endpoint = `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${apiKey}`;
        try {
          apiResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
          });
          
          responseBody = await apiResponse.json();

          if (apiResponse.ok) {
            // Successful call, return the response immediately.
            // The raw REST response nests the text inside candidates.
            const content = responseBody.candidates?.[0]?.content?.parts?.[0]?.text;
            const responseObject = {
              text: content,
              groundingMetadata: responseBody.candidates?.[0]?.groundingMetadata
            };
            return new Response(JSON.stringify(responseObject), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
          }
          
          const errorMessage = responseBody.error?.message || `Gemini API failed with status ${apiResponse.status}`;

          // If the status is 400, it's a bad request (e.g., malformed prompt). Don't retry with other keys.
          if (apiResponse.status === 400) {
             throw new Error(`${errorMessage} (Bad Request). This indicates a problem with the prompt data and will not be retried.`);
          }

          // For other errors (e.g., 429 quota, 401/403 key error, 5xx server error), log it and try the next key.
          lastError = new Error(`Key ending in '...${apiKey.slice(-4)}' failed with status ${apiResponse.status}: ${errorMessage}`);
          console.warn(lastError.message); // Log the failure and continue to the next key.

        } catch (fetchErr) {
          lastError = new Error(`A network or fetch error occurred for key ending in '...${apiKey.slice(-4)}': ${fetchErr.message}`);
          console.warn(lastError.message);
        }
      }
      
      // If the loop completes, all keys have failed.
      const finalErrorMessage = `All ${geminiApiKeys.length} Gemini API key(s) in the pool failed. Last known error: ${lastError?.message || 'An unknown error occurred.'}`;
      return new Response(JSON.stringify({ error: finalErrorMessage }), { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    } else if (provider === 'custom') {
      const customApiKey = req.headers.get('x-provider-api-key');
      if (!customApiKey) {
        return new Response(JSON.stringify({ error: 'Missing API key in X-Provider-Api-Key header for the custom provider (Groq).' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      const customPayload = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4096,
      };

      apiResponse = await fetch(GROQ_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${customApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customPayload),
      });
      responseBody = await apiResponse.json();
      
      if (!apiResponse.ok) {
        throw new Error(responseBody.error?.message || `Custom Provider API failed with status ${apiResponse.status}`);
      }

      // For Groq/OpenAI-compatible, the response we want is a stringified JSON inside the 'content' field
      const content = responseBody.choices?.[0]?.message?.content;
      if (content) {
        // Return the content directly, as it's the JSON string the frontend expects
        return new Response(content, { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
      throw new Error("Custom provider response did not contain the expected message content.");

    } else {
      return new Response(JSON.stringify({ error: `Unsupported provider: ${provider}` }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

  } catch (err) {
    console.error('Proxy function error:', err);
    return new Response(JSON.stringify({ error: err.message || 'An unexpected error occurred in the proxy.' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});