const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class BinotelService {
  /**
   * Universal helper to send authenticated POST requests to Binotel REST API.
   * @param {string} endpoint - API method (e.g. 'settings/list-of-employees')
   * @param {Object} [params] - Additional parameters for the method
   * @returns {Promise<Object>} API response data
   */
  async sendRequest(endpoint, params = {}) {
    const key = config.BINOTEL_API_KEY;
    const secret = config.BINOTEL_API_SECRET;
    
    if (!key || !secret) {
      throw new Error('Учетные данные Binotel API не настроены в панели управления.');
    }
    
    const url = `https://api.binotel.com/api/4.0/${endpoint}.json`;
    const payload = {
      ...params,
      key,
      secret
    };
    
    logger.info(`Sending Binotel request to endpoint: ${endpoint}`);
    
    try {
      const response = await axios.post(url, payload, { timeout: 15000 });
      if (response.data && response.data.status === 'success') {
        return response.data;
      } else {
        const errorMsg = response.data && response.data.message 
          ? response.data.message 
          : (response.data && response.data.code ? `Error code ${response.data.code}` : 'Unknown Binotel API error');
        logger.error(`Binotel API Error at ${endpoint}: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      logger.error(`Binotel connection failed for ${endpoint}: ${error.message}`);
      throw new Error(`Ошибка подключения к Binotel API: ${error.message}`);
    }
  }

  /**
   * Fetches all registered employees from Binotel settings.
   * @returns {Promise<Object>} Map of email -> employee data
   */
  async fetchEmployees() {
    const data = await this.sendRequest('settings/list-of-employees');
    return data.listOfEmployees || {};
  }

  /**
   * Fetches call details for a specific UNIX timestamp range.
   * @param {number} startTime - UNIX timestamp in seconds
   * @param {number} stopTime - UNIX timestamp in seconds
   * @returns {Promise<Object>} Map of call ID -> call details
   */
  async fetchCallsForPeriod(startTime, stopTime) {
    const data = await this.sendRequest('stats/list-of-calls-for-period', {
      startTime,
      stopTime
    });
    return data.callDetails || {};
  }
}

module.exports = new BinotelService();
