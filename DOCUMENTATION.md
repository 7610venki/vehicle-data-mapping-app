# Vehicle Data Mapping Application Documentation

## 1. Project Overview

This application is a web-based tool designed to assist users in mapping vehicle data from various sources to a standardized format. It provides a user-friendly interface for uploading data files, mapping columns to a predefined schema, and exporting the normalized data. The application leverages AI-powered suggestions to streamline the mapping process and ensures data consistency and accuracy.

## 2. Technologies Used

- **Frontend:**
  - **React:** A JavaScript library for building user interfaces.
  - **TypeScript:** A typed superset of JavaScript that compiles to plain JavaScript.
  - **Vite:** A fast build tool and development server for modern web projects.
  - **Tailwind CSS:** A utility-first CSS framework for rapid UI development.
  - **Framer Motion:** A library for creating animations in React.
- **Backend (Serverless):**
  - **Supabase:** An open-source Firebase alternative for building secure and scalable backends.
    - **Supabase Auth:** For user authentication and authorization.
    - **Supabase Database:** A PostgreSQL database for storing application data.
    - **Supabase Edge Functions:** For running server-side logic.
- **AI & Machine Learning:**
  - **Google Gemini:** A large language model used for providing intelligent mapping suggestions.

## 3. Project Structure

```
.
├── .gitignore
├── App.tsx
├── components
│   ├── ActionButton.tsx
│   ├── Alert.tsx
│   ├── ApiErrorDialog.tsx
│   ├── Auth.tsx
│   ├── Card.tsx
│   ├── ColumnSelector.tsx
│   ├── Dialog.tsx
│   ├── DialogProvider.tsx
│   ├── FileUpload.tsx
│   ├── Icons.tsx
│   ├── LoadingSpinner.tsx
│   ├── ProgressBar.tsx
│   ├── ResultsTable.tsx
│   ├── SessionManager.tsx
│   └── ui
│       └── expandable-tabs-1.tsx
├── constants.ts
├── index.html
├── index.tsx
├── lib
│   └── utils.ts
├── package.json
├── README.md
├── services
│   ├── apiErrorData.ts
│   ├── csvExporter.ts
│   ├── fileParserService.ts
│   ├── geminiService.ts
│   ├── mappingService.ts
│   ├── normalizationService.ts
│   ├── sessionService.ts
│   ├── supabaseClient.ts
│   └── llm
│       ├── apiKeyManager.ts
│       ├── customProvider.ts
│       ├── geminiProvider.ts
│       ├── provider.ts
│       └── proxy-llm-function.ts
├── supabase
│   ├── functions
│   │   └── validate-user-domain
│   │       └── index.ts
│   └── config.toml
├── tsconfig.json
└── types.ts
```

### 3.1. Key Files and Directories

- **`App.tsx`**: The main application component that orchestrates the overall layout and routing.
- **`components/`**: Contains all the reusable React components that make up the user interface.
- **`constants.ts`**: Stores constant values used throughout the application.
- **`lib/`**: Utility functions and helper modules.
- **`services/`**: Modules responsible for handling business logic and interacting with external APIs (Supabase, Gemini).
- **`supabase/`**: Configuration and server-side code for the Supabase backend.
  - **`functions/`**: Supabase Edge Functions for custom server-side logic.
- **`types.ts`**: TypeScript type definitions for data structures used in the application.

## 4. Core Components

- **`Auth.tsx`**: Handles user authentication (sign-in and sign-up) using Supabase Auth. It includes form validation and error handling.
- **`FileUpload.tsx`**: Allows users to upload their vehicle data files (e.g., CSV, Excel).
- **`ColumnSelector.tsx`**: The core UI component where users can map the columns from their uploaded file to the predefined schema.
- **`ResultsTable.tsx`**: Displays the normalized and mapped data in a tabular format.
- **`ActionButton.tsx`**: A generic button component used for various actions in the application.
- **`DialogProvider.tsx`**: A context provider for managing dialogs and modals.

## 5. Services

- **`supabaseClient.ts`**: Initializes and exports the Supabase client, making it available to other parts of the application.
- **`geminiService.ts`**: Interacts with the Google Gemini API to get intelligent mapping suggestions.
- **`mappingService.ts`**: Contains the logic for mapping the source data to the target schema.
- **`normalizationService.ts`**: Handles data normalization and cleaning.
- **`fileParserService.ts`**: Parses the uploaded data files into a structured format.
- **`csvExporter.ts`**: Exports the mapped data to a CSV file.

## 6. Supabase Integration

### 6.1. Authentication

User authentication is handled by Supabase Auth. The application uses email and password-based authentication.

### 6.2. Edge Functions

- **`validate-user-domain`**: This server-side function is triggered when a new user signs up. It checks if the user's email domain is on the allowlist (`shory.com`) and deletes the user if it's not. This provides an extra layer of security.

## 7. Getting Started

### 7.1. Prerequisites

- Node.js and npm (or yarn)
- Supabase CLI

### 7.2. Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up Supabase:**
    - Log in to the Supabase CLI: `supabase login`
    - Link your project: `supabase link --project-ref <your-project-ref>`
    - Create a `.env` file in the root of the project and add your Supabase URL and anon key:
      ```
      VITE_SUPABASE_URL=<your-supabase-url>
      VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
      ```
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `https://vehicle-data-mapping-app.vercel.app/`.
