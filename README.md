# Vehicle Data Mapping: User Guide

This guide will help you get started with the Vehicle Data Mapping application.

## What This App Does

At its core, this application intelligently matches vehicle records from two different files (e.g., a "Shory" file and an "Insurance Company" file).

It's designed to solve common data inconsistencies, like:
- Typos ("Hundai" vs. "Hyundai")
- Different naming conventions ("F-150" vs. "F150 Raptor")
- Missing information

The app uses multiple layers of technology, including fuzzy text matching and advanced AI, to find the most accurate match for each of your records. Best of all, it learns from every session run by all users, constantly improving its accuracy for everyone.

## How It Works: The Four-Layer Matching Engine

This app doesn't just use one method to find matches; it uses a sophisticated, four-layer engine. When you start the mapping process, each of your Shory records is processed through these layers sequentially until a high-confidence match is found. This layered approach maximizes both speed and accuracy.

#### Layer 1: Cloud Knowledge Base (Fastest)

*   **What it is:** A global, shared database of high-confidence historical matches.
*   **How it works:** Before any complex processing, the system checks if an identical mapping (e.g., `"Chevy"` to `"Chevrolet"`) has been successfully made by any user before. If so, it's an instant match.
*   **Benefit:** This is the fastest and most accurate layer, resolving common matches in milliseconds. It gets smarter and faster as more people use the app.

#### Layer 2: AI-Generated Rules (Fast)

*   **What it is:** A set of general matching rules that the AI has automatically and safely created by observing patterns in past matches.
*   **How it works:** The system applies rules like, "If `make` is `merc`, set `make` to `Mercedes-Benz`." The rule generation process is now much stricter, with automated validation to prevent bad rules from being learned.
*   **Benefit:** Catches common variations that aren't yet in the knowledge base, providing another layer of high-speed, reliable matching.

#### Layer 3: Fuzzy Matching (For Typos)

*   **What it is:** A text-similarity algorithm (Fuse.js) designed to find matches with minor typos or spelling differences.
*   **How it works:** If no knowledge or rule applies, the app calculates a "fuzzy" similarity score between your record and potential matches (e.g., it will find that "Hundai" is very similar to "Hyundai"). You can control the strictness of this matching in the Parameters step.
*   **Benefit:** Reliably handles common human errors in data entry.

#### Layer 4: Advanced AI Matching (Most Powerful)

For the most difficult cases that remain, the app uses the Google Gemini AI model in two powerful ways:

1.  **Semantic Comparison:** For records where fuzzy matching finds several *possible* candidates, it sends the top few to the AI. The AI then uses its deep understanding of language and context to choose the single best semantic fit.
2.  **Web Search Grounding:** For records with no obvious candidates at all, it uses **Gemini with Google Search**. The AI can search the web for real-world information about the vehicle (e.g., rare models, new releases, or regional naming conventions) to make an informed decision. The sources it uses are even provided in the results for transparency.

### The Learning Loop

The most powerful feature is that the system learns. High-confidence matches made by the Fuzzy and AI layers are used to anonymously update the global **Knowledge Base** and generate new, **validated Rules**. This creates a powerful feedback loop where the application becomes faster, more accurate, and more intelligent with every session run by every user.

## How to Use It: A Quick Guide

Follow these simple steps to map your data:

#### Step 1: Sign In / Sign Up
Create an account or sign in. This allows you to save your mapping sessions and access them later.

#### Step 2: Upload Your Files
- **Upload Shory File:** Provide your primary vehicle data file.
- **Upload Insurance Co. File:** Provide the second file you want to match against.
- _Supported formats are CSV and XLSX (Excel)._

#### Step 3: Configure Your Columns
For both files, use the dropdown menus to tell the app which column contains the **Vehicle Make** (e.g., "Ford") and which contains the **Vehicle Model** (e.g., "Explorer"). You can also select other columns you want to keep in the final output.

#### Step 4: Set Parameters & Run
On this screen, you can review the matching settings. For most cases, the default settings are perfect. Just click the **Start Mapping Process** button to begin.

#### Step 5: Review & Download Results
Once the process is complete, you'll see a detailed results table showing how each record was matched. You can review the AI's reasoning and then click **Download Results** to get a clean CSV file of your newly mapped data.

---

## Frequently Asked Questions (FAQ)

**Q: Why didn't some of my vehicles get a match?**
**A:** This can happen if the vehicle data is very different in both files, if it's a very rare vehicle, or if a significant typo exists. The "AI Reason" column in the results table often gives a clue as to why a match wasn't found by the automated layers.

**Q: What do the different "Match Status" types mean?**
**A:** They show which technology layer made the match:
- **Matched (Knowledge):** The best kind of match. It was found instantly using a high-confidence mapping learned from a previous session.
- **Matched (Learned Rule):** A fast match made by a safe, validated rule the AI created (e.g., always map "Merc" to "Mercedes-Benz").
- **Matched (Fuzzy):** A good match found by correcting a minor typo.
- **Matched (AI):** An advanced match made by the AI's deep understanding of the vehicle names, often using web search.

**Q: Is my data private?**
**A:** **Yes.** Your uploaded files and saved mapping sessions are completely private and tied to your account. The only thing that is shared is the *anonymous learning* that improves the system for everyone (e.g., the fact that "chevy" can be mapped to "Chevrolet" is added to the global knowledge base).

**Q: How do I save my work?**
**A:** On the results screen, click the **Save Session** button. You can load it again anytime from the welcome screen.

---

## For Developers

### Setup & Run Locally

**Prerequisites:** Node.js, Supabase account

1.  **Clone the repository.**
2.  **Install dependencies:**
    `npm install`
3.  **Configure Supabase Backend:**
    *   The application uses Supabase for authentication, session storage, and as a secure proxy for AI calls. You will need to set up the database schema and Edge Functions. Please refer to the SQL setup file and Edge Function code (`proxy-llm-function.ts`) in the repository.
4.  **Configure Environment Variables:**
    *   All API keys and secrets are managed as environment variables in Supabase, not in the frontend code.
    *   Navigate to your Supabase Project dashboard -> Edge Functions -> `proxy-llm`.
    *   Go to the function's "Secrets" section.
    *   Add the following secrets. These are essential for the application to work.
        *   `GEMINI_API_KEYS`: A comma-separated list of your Google Gemini API keys. The function will rotate through them.
        *   `SUPABASE_URL`: Your Supabase project URL. Found in Project Settings -> API.
        *   **`SUPABASE_SERVICE_ROLE_KEY`**: Your Supabase `service_role` key. Found in Project Settings -> API. **CRITICAL: This key bypasses all RLS policies and must be kept secret.** It is required for the application to update the global knowledge base.
5.  **Run the local development server:**
    `npm run dev`

### Deploying

This application is designed to be deployed to a static hosting provider like Vercel or Netlify.

1.  **Connect your Git repository** to your hosting provider.
2.  **Configure Build Settings:**
    *   Build Command: `npm run build` or `vite build`
    *   Publish Directory: `dist`
3.  **Set Environment Variables:**
    *   In your hosting provider's project settings, add the following environment variables. **They must be prefixed with `VITE_` to be exposed to the client-side application.**
        *   `VITE_SUPABASE_URL`: Your Supabase project URL.
        *   `VITE_SUPABASE_ANON_KEY`: Your Supabase public `anon` key.
    *   **Do not** expose your `GEMINI_API_KEYS` or `SUPABASE_SERVICE_ROLE_KEY` here. They must only live in the secure secrets manager for your Supabase Edge Function.