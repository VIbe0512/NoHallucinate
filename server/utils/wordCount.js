/**
 * Counts the number of words in a string.
 * Trims whitespace, splits by whitespace characters, and filters out empty strings.
 *
 * @param {string} text - The input string to count words for.
 * @returns {number} The count of words.
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}
