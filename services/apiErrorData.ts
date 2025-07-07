

export interface ApiErrorDetail {
  code: number;
  status: string;
  description: string;
  example: string;
  solution: string;
  keywords: string[];
}

// Data from the Gemini API documentation image provided by the user.
export const GEMINI_API_ERRORS: ApiErrorDetail[] = [
  {
    code: 400,
    status: 'INVALID_ARGUMENT',
    description: 'The request body is malformed.',
    example: 'There is a typo, or a missing required field in your request.',
    solution: 'Check the API reference for request format, examples, and supported versions. Using features from a newer API version with an older endpoint can cause errors.',
    keywords: ['INVALID_ARGUMENT'],
  },
  {
    code: 400,
    status: 'FAILED_PRECONDITION',
    description: 'Gemini API free tier is not available in your country. Please enable billing on your project in Google AI Studio.',
    example: 'You are making a request in a region where the free tier is not supported, and you have not enabled billing on your project in Google AI Studio.',
    solution: 'To use the Gemini API, you will need to setup a paid plan using <a href="https://aistudio.google.com/billing" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Google AI Studio</a>.',
    keywords: ['FAILED_PRECONDITION', 'enable billing'],
  },
  {
    code: 403,
    status: 'PERMISSION_DENIED',
    description: "Your API key doesn't have the required permissions.",
    example: 'You are using the wrong API key; you are trying to use a tuned model without going through proper authentication.',
    solution: 'Check that your API key is set and has the right access. And make sure to go through <a href="https://ai.google.dev/gemini-api/docs/auth" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">proper authentication</a> to use tuned models.',
    keywords: ['PERMISSION_DENIED', 'API key is invalid'],
  },
  {
    code: 404,
    status: 'NOT_FOUND',
    description: "The requested resource wasn't found.",
    example: 'An image, audio, or video file referenced in your request was not found.',
    solution: 'Check if all <a href="https://ai.google.dev/gemini-api/docs/api-ref" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">parameters in your request are valid</a> for your API version.',
    keywords: ['NOT_FOUND', 'was not found'],
  },
  {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    description: "You've exceeded the rate limit.",
    example: 'You are sending too many requests per minute with the free tier Gemini API.',
    solution: 'Ensure you\'re within the model\'s <a href="https://ai.google.dev/gemini-api/docs/models/gemini#rate-limits" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">rate limit</a>. <a href="https://ai.google.dev/gemini-api/docs/quota#request-quota" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Request a quota increase</a> if needed.',
    keywords: ['RESOURCE_EXHAUSTED', 'rate limit', '429'],
  },
  {
    code: 500,
    status: 'INTERNAL',
    description: "An unexpected error occurred on Google's side.",
    example: 'Your input context is too long.',
    solution: 'Reduce your input context or temporarily switch to another model (e.g. from Gemini 1.5 Pro to Gemini 1.5 Flash) and see if it works. Or wait a bit and retry your request. If the issue persists after re-trying, please report it using the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Send feedback</a> button in Google AI Studio.',
    keywords: ['INTERNAL', 'internal error', '500'],
  },
  {
    code: 503,
    status: 'UNAVAILABLE',
    description: 'The service may be temporarily overloaded or down.',
    example: 'The service is temporarily running out of capacity.',
    solution: 'Temporarily switch to another model (e.g. from Gemini 1.5 Pro to Gemini 1.5 Flash) and see if it works. Or wait a bit and retry your request. If the issue persists after re-trying, please report it using the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Send feedback</a> button in Google AI Studio.',
    keywords: ['UNAVAILABLE', 'service is currently unavailable', '503'],
  },
  {
    code: 504,
    status: 'DEADLINE_EXCEEDED',
    description: 'The service is unable to finish processing within the deadline.',
    example: 'Your prompt (or context) is too large to be processed in time.',
    solution: 'Set a larger <code class="font-mono bg-muted text-muted-foreground px-1 py-0.5 rounded-md text-xs">timeout</code> in your client request to avoid this error.',
    keywords: ['DEADLINE_EXCEEDED', 'timed out', 'timeout', '504'],
  },
];

/**
 * Finds a detailed error object based on keywords in a raw error message string.
 * @param rawErrorMessage The error message from the API.
 * @returns An ApiErrorDetail object if a match is found, otherwise null.
 */
export function findErrorDetails(rawErrorMessage: string): ApiErrorDetail | null {
  if (!rawErrorMessage) return null;
  const lowerCaseMessage = rawErrorMessage.toLowerCase();
  for (const errorDetail of GEMINI_API_ERRORS) {
    for (const keyword of errorDetail.keywords) {
      if (lowerCaseMessage.includes(keyword.toLowerCase())) {
        return errorDetail;
      }
    }
  }
  return null;
}
