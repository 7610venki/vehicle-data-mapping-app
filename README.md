# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:** Node.js

1.  Install dependencies:
    `npm install`
2.  Run the app:
    `npm run dev`

**Note:** For local development, the AI providers (Gemini, Groq) are now called via a Supabase Edge Function. You must configure your API keys in the environment variables for that function. See the Supabase documentation for how to set secrets for local Edge Function development.

## Deploying

See instructions for deploying to a service like Vercel or Netlify. You will need to set your Supabase URL, Anon Key, and your AI provider API keys as environment variables in your hosting provider's project settings.
