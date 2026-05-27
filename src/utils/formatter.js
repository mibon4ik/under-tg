const config = require('../config/config');

/**
 * Formats a number as a currency string according to project requirements:
 * - Space separator between thousands
 * - Tenge symbol (₸) at the end
 * - Truncated/rounded to integer (no decimals/commas)
 * Example: 1242200 -> "1 242 200 ₸"
 * @param {number} num - The number to format.
 * @returns {string} The formatted currency string.
 */
function formatCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return '0 ₸';
  }
  const rounded = Math.round(num);
  // Using Russian locale gives space separation by default
  const formatted = new Intl.NumberFormat('ru-RU', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(rounded);

  // Note: some runtimes use non-breaking space (\u00A0) for grouping.
  // We'll normalize it to standard space (\u0020) for consistent rendering.
  return `${formatted.replace(/\u00A0/g, ' ')} ₸`;
}

/**
 * Formats a Date object or date-string into "dd.MM.yyyy" string in the configured timezone.
 * @param {Date|string|number} date - The date to format.
 * @param {string} [timezone] - Target timezone (defaults to config TIMEZONE).
 * @returns {string} The formatted date string (e.g. "26.05.2026").
 */
function formatDate(date, timezone = config.TIMEZONE) {
  const d = date ? new Date(date) : new Date();
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  } catch (error) {
    // Fallback if timezone is invalid
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }
}

module.exports = {
  formatCurrency,
  formatDate,
};
