const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Service to connect and fetch data from Google Sheets via the Apps Script Web App.
 */
class SheetsService {
  /**
   * Fetches data from sheets dynamically resolved via the Apps Script Web App.
   * Retries up to 3 times with exponential backoff on failure.
   * THROWS an error if all attempts fail — the caller must handle it.
   * @param {string} targetDateStr - Target date in format "dd.MM.yyyy"
   * @returns {Promise<Object>} An object mapping sheetName -> 2D array of raw row data.
   */
  async fetchSheetsData(targetDateStr) {
    const webAppUrl = config.APPS_SCRIPT_URL;

    if (!webAppUrl) {
      throw new Error('Google Apps Script Web App URL (APPS_SCRIPT_URL) is not configured.');
    }

    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`[Attempt ${attempt}/${MAX_RETRIES}] Fetching spreadsheet data for date: ${targetDateStr}...`);

        const response = await axios.get(webAppUrl, {
          params: {
            date: targetDateStr,
            sheetProd: config.SHEET_PROD || '',
            sheetOtmen: config.SHEET_OTMEN || ''
          },
          timeout: 30000 // 30s timeout for Google Apps Script execution limits
        });

        if (response.data && response.data.ok) {
          const data = response.data.data;

          // Validate that the response actually contains sheet data with rows
          if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            throw new Error('Apps Script returned ok=true but the data object is empty or missing.');
          }

          // Check if at least one sheet has actual rows (more than just headers)
          let hasRows = false;
          for (const [sheetName, rows] of Object.entries(data)) {
            if (Array.isArray(rows) && rows.length > 1) {
              hasRows = true;
              logger.info(`  Sheet "${sheetName}": ${rows.length} rows (including header)`);
            } else {
              logger.warn(`  Sheet "${sheetName}": empty or header-only (${Array.isArray(rows) ? rows.length : 0} rows)`);
            }
          }

          if (!hasRows) {
            logger.warn('All sheets returned are empty or header-only. Data may be genuinely empty for this date.');
          }

          logger.info(`Spreadsheet data successfully fetched on attempt ${attempt}.`);
          return data;
        } else {
          const errMsg = response.data ? response.data.error : 'unknown error';
          throw new Error(`Apps Script returned error: ${errMsg}`);
        }
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === MAX_RETRIES;

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          logger.error(`[Attempt ${attempt}/${MAX_RETRIES}] Request timed out: ${error.message}`);
        } else if (error.response) {
          logger.error(`[Attempt ${attempt}/${MAX_RETRIES}] HTTP ${error.response.status}: ${error.message}`);
        } else {
          logger.error(`[Attempt ${attempt}/${MAX_RETRIES}] Error: ${error.message}`);
        }

        if (!isLastAttempt) {
          const delay = attempt * 2000; // 2s, 4s backoff
          logger.info(`Retrying in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted — throw to prevent zero-report
    throw new Error(`Failed to fetch spreadsheet data after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || 'unknown'}`);
  }
}

module.exports = new SheetsService();

