const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Service to connect and fetch data from Google Sheets via the Apps Script Web App.
 */
class SheetsService {
  /**
   * Fetches data from sheets dynamically resolved via the Apps Script Web App.
   * Safe against individual read failures, bad URLs, and returns fallback structure on error.
   * @param {string} targetDateStr - Target date in format "dd.MM.yyyy"
   * @returns {Promise<Object>} An object mapping sheetName -> 2D array of raw row data.
   */
  async fetchSheetsData(targetDateStr) {
    const webAppUrl = config.APPS_SCRIPT_URL;

    // Default empty fallback structures
    const parts = (targetDateStr || '').split('.');
    const month = parts[1] || '05';
    const months = {
      '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
      '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
      '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
    };
    const monthName = months[month] || 'Май';
    const sheet1 = `Общие продажи ${monthName} (Продления)`;
    const sheet2 = `Общие продажи ${monthName} (Отмены)`;

    const fallbackData = {};
    fallbackData[sheet1] = [];
    fallbackData[sheet2] = [];

    if (!webAppUrl) {
      logger.error('Google Apps Script Web App URL (APPS_SCRIPT_URL) is not configured.');
      return fallbackData;
    }

    try {
      logger.info(`Fetching spreadsheet data via Apps Script Web App for date: ${targetDateStr}...`);
      
      const response = await axios.get(webAppUrl, {
        params: { date: targetDateStr },
        timeout: 25000 // 25s timeout for Google Apps Script execution limits
      });

      if (response.data && response.data.ok) {
        logger.info('Spreadsheet data successfully fetched from Apps Script Web App.');
        return response.data.data || fallbackData;
      } else {
        const errMsg = response.data ? response.data.error : 'unknown error';
        logger.error(`Apps Script Web App returned an error: ${errMsg}`);
        return fallbackData;
      }
    } catch (error) {
      logger.error(`Failed to fetch data from Apps Script Web App: ${error.message}`);
      return fallbackData;
    }
  }
}

module.exports = new SheetsService();
