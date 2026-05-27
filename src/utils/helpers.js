/**
 * Helper utilities for cell parsing and text manipulation.
 */

/**
 * Safely parses any cell value into a number.
 * Handles spaces, currency symbols (₸, руб, etc.), commas as decimals, and returns a clean number.
 * @param {any} val - The raw cell value from Google Sheets.
 * @returns {number} The parsed float/integer value, defaulting to 0 if invalid.
 */
function parseNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;

  // Convert to string and clean up
  let str = String(val).trim();
  if (!str) return 0;

  // Remove spaces, non-breaking spaces (char code 160), and thousands separators
  str = str.replace(/[\s\u00A0]/g, '');

  // If there are commas, and they look like decimal separators:
  // e.g. "123,45" -> "123.45"
  // But if there's both dot and comma (e.g. "1,242.00" or "1.242,00"), handle appropriately.
  // Standard Russian formats often use comma for decimals: "171000,00" or space for thousands.
  // We'll replace all commas with dots, and if there are multiple dots, clean them.
  str = str.replace(/,/g, '.');

  // If there is more than one dot (e.g. "1.242.000"), it means dot was used for thousands.
  // We remove all dots except the last one if it acts as a decimal separator.
  const parts = str.split('.');
  if (parts.length > 2) {
    // Join all except the last part, then append the last part with a dot
    const last = parts.pop();
    str = parts.join('') + '.' + last;
  }

  // Remove any remaining non-numeric characters except minus and dot
  str = str.replace(/[^0-9.-]/g, '');

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalizes strings for robust category matching.
 * Trims, lowercases, and removes extra spaces.
 * @param {string} val - The input string.
 * @returns {string} Normalized string.
 */
function normalizeString(val) {
  if (!val) return '';
  return String(val).trim().toLowerCase();
}

module.exports = {
  parseNumber,
  normalizeString,
};
