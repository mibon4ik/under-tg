const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Service to handle sending notifications via Telegram Bot API.
 */
class TelegramService {
  /**
   * Sends a text message to all configured chat IDs.
   * Runs in parallel/sequence and continues even if one chat ID fails.
   * @param {string} text - The message text to send.
   * @returns {Promise<Object>} Summary of sending results.
   */
  async sendReport(text) {
    const token = config.TELEGRAM.BOT_TOKEN;
    const chatIds = config.TELEGRAM.CHAT_IDS;

    if (!token) {
      logger.error('Telegram bot token (BOT_TOKEN) is not configured.');
      throw new Error('Telegram token not configured');
    }

    if (!chatIds || chatIds.length === 0) {
      logger.error('No Telegram chat IDs (CHAT_ID) configured.');
      throw new Error('Telegram chat IDs not configured');
    }

    logger.info(`Sending Telegram report to ${chatIds.length} recipient(s)...`);
    const results = { success: [], failed: [] };

    for (const chatId of chatIds) {
      try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await axios.post(url, {
          chat_id: chatId,
          text: text,
          // Use standard markdown if formatting matches, but raw plain text works best
          // for the requested design to avoid parsing issues with special symbols like ₸.
        });
        logger.info(`Successfully sent report to chat ID: ${chatId}`);
        results.success.push(chatId);
      } catch (error) {
        let errMsg = error.message;
        if (error.response && error.response.data) {
          errMsg = JSON.stringify(error.response.data);
        }
        logger.error(`Failed to send report to chat ID ${chatId}: ${errMsg}`);
        results.failed.push({ chatId, error: errMsg });
      }
    }

    return results;
  }
}

module.exports = new TelegramService();
