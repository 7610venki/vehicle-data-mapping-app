## Project Overview

This project is a web application for intelligently mapping vehicle data from two separate files. It uses a multi-layered approach to match records, including a knowledge base, AI-generated rules, fuzzy matching, and a powerful AI layer that leverages Google's Gemini model.

### Key Features

*   **Multi-layered matching engine:** Combines a cloud knowledge base, AI-generated rules, fuzzy matching, and advanced AI matching to provide accurate results.
*   **AI-powered:** Uses the Google Gemini AI model for semantic comparison and web search grounding to find the best possible match.
*   **Learns and improves:** The system learns from every mapping session, constantly improving its accuracy and speed.
*   **User-friendly interface:** A simple, step-by-step process for uploading files, configuring columns, and reviewing results.
*   **Secure and private:** User data is kept private, while anonymous learnings are shared to improve the system for everyone.

### Technical Stack

*   **Frontend:** React, TypeScript, Vite, Tailwind CSS
*   **Backend:** Supabase (authentication, database, edge functions)
*   **AI:** Google Gemini

### Project Structure

*   **`components/`**: Contains reusable UI components.
*   **`services/`**: Houses the core application logic, including services for file parsing, AI interaction, data mapping, and Supabase communication.
*   **`lib/`**: Contains utility functions.
*   **`supabase/`**: Contains the Supabase backend configuration, including database schema and edge functions.
    *   **`proxy-llm-function.ts`**: A key Edge Function that securely handles all communication with the AI provider (Gemini). It manages API key rotation and includes specific logic to handle knowledge base updates, which was recently patched to fix a bug preventing new knowledge from being saved.



