// @ts-nocheck

/// <reference types="https://deno.land/x/deno/globals.d.ts" />

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
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiApiKey) {
        return new Response(JSON.stringify({ error: 'Gemini API key is not configured on the server. Please set GEMINI_API_KEY in your Supabase project settings.' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      const geminiPayload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: responseMimeType || 'application/json',
        },
        ...(tools && { tools: tools }),
      };
      
      const endpoint = `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${geminiApiKey}`;

      apiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });
      responseBody = await apiResponse.json();

      if (!apiResponse.ok) {
        throw new Error(responseBody.error?.message || `Gemini API failed with status ${apiResponse.status}`);
      }
      
      // For Gemini, we return a structured object with the text and any grounding metadata
      const content = responseBody.candidates?.[0]?.content?.parts?.[0]?.text;
      const responseObject = {
        text: content,
        groundingMetadata: responseBody.candidates?.[0]?.groundingMetadata
      };
      return new Response(JSON.stringify(responseObject), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

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