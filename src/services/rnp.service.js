const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Service to manage RNP report requests strictly from Google Apps Script Web App.
 */
class RnpService {
  /**
   * Fetches the formatted scorecard completion status for the last 3 days.
   * @returns {Promise<string>} Formatted Telegram Markdown report.
   */
  async getReportingStatus() {
    const webAppUrl = config.APPS_SCRIPT_URL;
    if (!webAppUrl) {
      logger.error('Google Apps Script Web App URL (APPS_SCRIPT_URL) is not configured.');
      return '⚠️ Не настроен URL веб-приложения Google Apps Script (APPS_SCRIPT_URL) в настройках.';
    }

    try {
      logger.info('Fetching RNP reporting status from Google Apps Script Web App...');
      const response = await axios.get(webAppUrl, {
        params: {
          action: 'rnpReportingStatus',
          timezone: config.TIMEZONE
        },
        timeout: 25000 // 25s timeout for Apps Script execution
      });

      if (response.data && response.data.ok) {
        return response.data.text;
      } else {
        const errorMsg = response.data ? response.data.error : 'unknown error';
        logger.error(`Apps Script returned an error for RNP status: ${errorMsg}`);
        return `⚠️ Не удалось получить отчет РНП: ${errorMsg}`;
      }
    } catch (error) {
      logger.error(`Failed to fetch RNP reporting status: ${error.message}`);
      return `⚠️ Ошибка соединения с Google Apps Script при запросе отчета РНП.`;
    }
  }

  /**
   * Fetches the list of missed reporting days for each manager for the last 14 days.
   * @returns {Promise<string>} Formatted Telegram Markdown report.
   */
  async getMissedDays() {
    const webAppUrl = config.APPS_SCRIPT_URL;
    if (!webAppUrl) {
      logger.error('Google Apps Script Web App URL (APPS_SCRIPT_URL) is not configured.');
      return '⚠️ Не настроен URL веб-приложения Google Apps Script (APPS_SCRIPT_URL) в настройках.';
    }

    try {
      logger.info('Fetching RNP missed days from Google Apps Script Web App...');
      const response = await axios.get(webAppUrl, {
        params: {
          action: 'rnpMissedDays',
          timezone: config.TIMEZONE
        },
        timeout: 25000 // 25s timeout
      });

      if (response.data && response.data.ok) {
        return response.data.text;
      } else {
        const errorMsg = response.data ? response.data.error : 'unknown error';
        logger.error(`Apps Script returned an error for RNP missed days: ${errorMsg}`);
        return `⚠️ Не удалось получить отчет РНП: ${errorMsg}`;
      }
    } catch (error) {
      logger.error(`Failed to fetch RNP missed days: ${error.message}`);
      return `⚠️ Ошибка соединения с Google Apps Script при запросе отчета РНП.`;
    }
  }
}

module.exports = new RnpService();
