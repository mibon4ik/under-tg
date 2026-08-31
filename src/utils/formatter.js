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
 * Normalizes timezone string to ensure valid IANA identifier for Astana/Kazakhstan (UTC+5).
 * Node.js and node-cron require 'Asia/Almaty' for Kazakhstan UTC+5.
 * @param {string} tz - Timezone string.
 * @returns {string} Normalized IANA timezone identifier.
 */
function normalizeTimezone(tz) {
  if (!tz || typeof tz !== 'string') {
    return 'Asia/Almaty';
  }
  const clean = tz.trim();
  const lower = clean.toLowerCase();
  
  if (
    lower === 'asia/astana' ||
    lower === 'astana' ||
    lower === 'астана' ||
    lower === 'kazakhstan' ||
    lower === 'казахстан' ||
    lower === 'utc+5' ||
    lower === 'gmt+5' ||
    lower === 'utc+05:00' ||
    lower === '+05:00' ||
    lower === '+05' ||
    lower === 'asia/almaty' ||
    lower === 'almaty'
  ) {
    return 'Asia/Almaty';
  }

  // Validate if Intl supports the provided timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: clean });
    return clean;
  } catch (e) {
    return 'Asia/Almaty';
  }
}

/**
 * Calculates total number of days in a specific month and year.
 * @param {number|string} year - 4-digit year (e.g. 2026).
 * @param {number|string} month - 1-based month (1 = Jan, ..., 12 = Dec).
 * @returns {number} Number of days in the month (28, 29, 30, or 31).
 */
function getDaysInMonth(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  // Using Date.UTC(y, m, 0) returns the 0th day of the NEXT month (which is the last day of month m)
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Formats a Date object or date-string into "dd.MM.yyyy" string in the configured timezone.
 * @param {Date|string|number} date - The date to format.
 * @param {string} [timezone] - Target timezone (defaults to config TIMEZONE / Asia/Almaty).
 * @returns {string} The formatted date string (e.g. "26.05.2026").
 */
function formatDate(date, timezone = config.TIMEZONE) {
  const d = date ? new Date(date) : new Date();
  const effectiveTz = normalizeTimezone(timezone);
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: effectiveTz,
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
  getDaysInMonth,
  normalizeTimezone,
};
