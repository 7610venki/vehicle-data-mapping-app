
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
 * It also removes model year numbers and other numeric identifiers to group models like
 * "IS 300" and "IS 500" into the same "IS" family.
 * @param text The full model string (e.g., "Camry XLE V6", "IS 500F").
 * @returns The extracted base model string (e.g., "camry", "is").
 */
export const extractBaseModel = (text: string): string => {
    const normalized = normalizeText(text);
    // First, remove all the descriptive keywords like 'sport', 'xle', 'awd', etc.
    let baseModel = normalized.replace(trimRemovalRegex, '').replace(/\s+/g, ' ').trim();
    
    // After removing keywords, aggressively remove trailing numbers, letters, or combinations
    // that often denote engine size, trim level, or special editions.
    // e.g., "is 500f" -> "is", "is 300" -> "is", "a4 2.0t" -> "a4"
    // This regex looks for a space followed by numbers and optional letters at the end of the string.
    baseModel = baseModel.replace(/\s[0-9].*$/, '').trim();

    return baseModel;
};
