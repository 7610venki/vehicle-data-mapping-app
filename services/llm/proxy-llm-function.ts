
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from 'https://esm.sh/@google/genai@0.12.0';

const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provider-api-key',
  'Content-Type': 'application/json',
};

// --- Helper for Gemini API Key Rotation ---
function getGeminiApiKey() {
    const geminiApiKeysString = Deno.env.get('GEMINI_API_KEYS');
    if (!geminiApiKeysString) throw new Error('GEMINI_API_KEYS not configured on server.');
    
    const keys = geminiApiKeysString.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) throw new Error('GEMINI_API_KEYS environment variable is empty.');

    // Simple round-robin strategy for key selection
    const index = parseInt(Deno.env.get('GEMINI_KEY_INDEX') || '0', 10);
    const nextIndex = (index + 1) % keys.length;
    Deno.env.set('GEMINI_KEY_INDEX', nextIndex.toString());
    
    return keys[index];
}


serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...CORS_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  }

  try {
    const { provider, model, prompt, tools, stream } = await req.json();

    if (!provider || !model || !prompt) {
      return new Response(JSON.stringify({ error: 'Request must contain "provider", "model", and "prompt".' }), { status: 400, headers: CORS_HEADERS });
    }

    if (provider === 'gemini') {
      const apiKey = getGeminiApiKey();
      const ai = new GoogleGenAI({ apiKey });
      
      const generationConfig = { temperature: 0.2, maxOutputTokens: 8192 };
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ];

      const requestPayload = {
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: { ...generationConfig, ...(tools && { tools }) },
        safetySettings,
      };

      if (stream) {
        const streamingResult = await ai.models.generateContentStream(requestPayload);
        
        // Pipe the stream from the SDK to the response
        const responseStream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of streamingResult) {
              // Each chunk is a GenerateContentResponse object. Stringify it and send.
              const chunkText = JSON.stringify(chunk) + '\n';
              controller.enqueue(encoder.encode(chunkText));
            }
            controller.close();
          }
        });
        return new Response(responseStream, { headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson' } });

      } else { // Non-streaming request
        const result = await ai.models.generateContent(requestPayload);
        return new Response(JSON.stringify(result), { status: 200, headers: CORS_HEADERS });
      }

    } else if (provider === 'custom') {
      const customApiKey = req.headers.get('x-provider-api-key');
      if (!customApiKey) return new Response(JSON.stringify({ error: 'Missing X-Provider-Api-Key header for custom provider.' }), { status: 401, headers: CORS_HEADERS });

      const customPayload = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 4096,
      };

      const apiResponse = await fetch(GROQ_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${customApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(customPayload),
      });
      const responseBody = await apiResponse.json();
      if (!apiResponse.ok) throw new Error(responseBody.error?.message || `Custom Provider API failed with status ${apiResponse.status}`);
      
      const content = responseBody.choices?.[0]?.message?.content;
      if (content) {
        return new Response(content, { status: 200, headers: CORS_HEADERS });
      }
      throw new Error("Custom provider response did not contain message content.");

    } else {
      return new Response(JSON.stringify({ error: `Unsupported provider: ${provider}` }), { status: 400, headers: CORS_HEADERS });
    }

  } catch (err) {
    console.error('Proxy function error:', err);
    return new Response(JSON.stringify({ error: err.message || 'An unexpected error occurred.' }), { status: 500, headers: CORS_HEADERS });
  }
});
