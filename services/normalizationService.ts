
import { TRIM_KEYWORDS } from '../constants';

// Create a regex to match whole words from the trim keywords list, case-insensitively
const trimRemovalRegex = new RegExp(`\\b(${TRIM_KEYWORDS.join('|')})\\b`, 'gi');

/**
 * Normalizes text by converting to lowercase, removing special characters, and collapsing whitespace.
 * @param text The string or number to normalize.
 * @returns A normalized string.
 */
export const normalizeText = (text?: string | number): string => {
  if (text === undefined || text === null) return '';
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, ' ').trim();
};


/**
 * Extracts a "base model" from a vehicle model string by removing common trim and attribute keywords.
 * @param text The full model string (e.g., "Camry XLE V6").
 * @returns The extracted base model string (e.g., "camry").
 */
export const extractBaseModel = (text: string): string => {
    const normalized = normalizeText(text);
    // Remove all keywords, then clean up extra spaces that might result
    return normalized.replace(trimRemovalRegex, '').replace(/\s+/g, ' ').trim();
};
