/// <reference types="https://deno.land/x/deno/globals.d.ts" />

// Deno-deploy-specific imports
// Note: This code is intended to be pasted into the `index.ts` file
// of an Edge Function named `proxy-llm` in your Supabase dashboard.
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

    if (provider === 'gemini') {
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiApiKey) {
        return new Response(JSON.stringify({ error: 'Gemini API key is not configured on the server.' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      const geminiPayload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: responseMimeType || 'application/json',
        },
        ...(tools && { tools: tools }), // Add tools if provided (for web search)
      };
      
      const endpoint = `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${geminiApiKey}`;

      apiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });

    } else if (provider === 'custom') { // Assuming 'custom' is Groq
      const groqApiKey = req.headers.get('x-provider-api-key');
      if (!groqApiKey) {
        return new Response(JSON.stringify({ error: 'Missing API key in X-Provider-Api-Key header for custom provider.' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      const groqPayload = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4096,
      };

      apiResponse = await fetch(GROQ_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(groqPayload),
      });

    } else {
      return new Response(JSON.stringify({ error: `Unsupported provider: ${provider}` }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      const errorMessage = data.error?.message || `Provider API failed with status ${apiResponse.status}`;
      console.error("LLM Provider Error:", data);
      return new Response(JSON.stringify({ error: errorMessage, details: data.error }), { status: apiResponse.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    
    let content;
    if (provider === 'gemini') {
      content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        // For Gemini, we return a structured object with the text and any grounding metadata
        const responseObject = {
          text: content,
          groundingMetadata: data.candidates?.[0]?.groundingMetadata
        };
        return new Response(JSON.stringify(responseObject), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    } else { // Handle Groq/OpenAI-compatible responses
      content = data.choices?.[0]?.message?.content;
      if (content) {
        // The content is the stringified JSON we want. Return it directly.
        return new Response(content, { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }
    }

    const fallbackError = "LLM response did not contain the expected message content.";
    console.error(fallbackError, data);
    return new Response(JSON.stringify({ error: fallbackError }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Proxy function error:', err);
    return new Response(JSON.stringify({ error: err.message || 'An unexpected error occurred in the proxy.' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
