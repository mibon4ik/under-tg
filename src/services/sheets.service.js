const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');
const formatter = require('../utils/formatter');

/**
 * Service to connect and fetch data from Google Sheets via the Apps Script Web App.
 * Includes in-memory caching and background prefetching to guarantee instant responses.
 */
class SheetsService {
  constructor() {
    this.cache = new Map(); // key -> { timestamp, data }
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL for seamless background updates
    this.isPrefetching = false;

    // Start background warming loop every 2 minutes for current date
    setInterval(() => {
      this.backgroundWarming().catch(err => {
        logger.debug(`Background warming silent notice: ${err.message}`);
      });
    }, 2 * 60 * 1000);
  }

  /**
   * Background task to keep today's sheet data pre-warmed in memory.
   */
  async backgroundWarming() {
    if (!config.APPS_SCRIPT_URL || this.isPrefetching) return;
    this.isPrefetching = true;
    try {
      const todayStr = formatter.formatDate(new Date());
      logger.info(`🔄 [Background Sync] Pre-warming spreadsheet cache for date: ${todayStr}...`);
      await this.fetchSheetsData(todayStr, true);
    } catch (e) {
      logger.warn(`[Background Sync] Pre-warm attempt failed: ${e.message}`);
    } finally {
      this.isPrefetching = false;
    }
  }

  /**
   * Fetches data from sheets dynamically resolved via the Apps Script Web App.
   * Checks pre-warmed memory cache first, falling back to 35s timeout fetch.
   * @param {string} targetDateStr - Target date in format "dd.MM.yyyy"
   * @param {boolean} forceRefresh - If true, bypasses the cache
   * @returns {Promise<Object>} An object mapping sheetName -> 2D array of raw row data.
   */
  async fetchSheetsData(targetDateStr, forceRefresh = false) {
    const webAppUrl = config.APPS_SCRIPT_URL;

    if (!webAppUrl) {
      throw new Error('Google Apps Script Web App URL (APPS_SCRIPT_URL) is not configured.');
    }

    const cacheKey = `${targetDateStr}_${config.SHEET_PROD || ''}_${config.SHEET_OTMEN || ''}`;
    const now = Date.now();

    // 1. Check cache first for instant response
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (now - cached.timestamp < this.CACHE_TTL_MS) {
        logger.info(`⚡ Returning cached spreadsheet data for date ${targetDateStr} (Age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
        return cached.data;
      }
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
          timeout: 35000 // 35s timeout to allow Google Apps Script execution time
        });

        if (response.data && response.data.ok) {
          const data = response.data.data;

          // Validate that the response contains sheet data with rows
          if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            throw new Error('Apps Script returned ok=true but data object is empty.');
          }

          let hasRows = false;
          for (const [sheetName, rows] of Object.entries(data)) {
            if (Array.isArray(rows) && rows.length > 1) {
              hasRows = true;
              logger.info(`  Sheet "${sheetName}": ${rows.length} rows`);
            } else {
              logger.warn(`  Sheet "${sheetName}": empty or header-only (${Array.isArray(rows) ? rows.length : 0} rows)`);
            }
          }

          if (!hasRows) {
            logger.warn('All sheets returned are empty or header-only for this date.');
          }

          logger.info(`Spreadsheet data successfully fetched on attempt ${attempt}.`);
          
          // Save to cache
          this.cache.set(cacheKey, { timestamp: now, data });

          return data;
        } else {
          const errMsg = response.data ? response.data.error : 'unknown error';
          throw new Error(`Apps Script returned error: ${errMsg}`);
        }
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === MAX_RETRIES;

        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          logger.error(`[Attempt ${attempt}/${MAX_RETRIES}] Request timed out (Google Apps Script slow response)`);
        } else if (error.response) {
          logger.error(`[Attempt ${attempt}/${MAX_RETRIES}] HTTP ${error.response.status}: ${error.message}`);
        } else {
          logger.error(`[Attempt ${attempt}/${MAX_RETRIES}] Error: ${error.message}`);
        }

        if (!isLastAttempt) {
          const delay = 1000;
          logger.info(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed — fallback to expired cache if available before throwing error
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      logger.warn(`⚠️ Network fetch failed. Serving fallback cached data from ${Math.round((now - cached.timestamp) / 1000)}s ago.`);
      return cached.data;
    }

    throw new Error(`Не удалось получить данные из таблицы после 3 попыток. Сбой сети или Google Apps Script не отвечает. (Ошибка: ${lastError?.message || 'timeout'})`);
  }
}

module.exports = new SheetsService();

