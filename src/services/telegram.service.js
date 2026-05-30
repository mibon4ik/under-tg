const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Service to handle sending notifications and listening to interactive commands via Telegram Bot API.
 */
class TelegramService {
  /**
   * Sends a text message to all globally configured chat IDs.
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
        await this.sendMessage(chatId, text);
        logger.info(`Successfully sent report to chat ID: ${chatId}`);
        results.success.push(chatId);
      } catch (error) {
        logger.error(`Failed to send report to chat ID ${chatId}: ${error.message}`);
        results.failed.push({ chatId, error: error.message });
      }
    }

    return results;
  }

  /**
   * Sends a single text message to a specific chat ID with optional custom keyboards.
   * @param {string|number} chatId - Target chat/user ID.
   * @param {string} text - Message text content.
   * @param {Object} [replyMarkup] - Optional Telegram Reply Markup object.
   * @returns {Promise<Object>} Telegram API response data.
   */
  async sendMessage(chatId, text, replyMarkup = null) {
    const token = config.TELEGRAM.BOT_TOKEN;
    if (!token) throw new Error('Telegram token not configured');

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await axios.post(url, payload);
    return response.data;
  }

  /**
   * Starts the background Telegram Bot Update listener loop using Long Polling.
   * Works anywhere (local PC, cloud Railway) instantly without Webhook or SSL configurations.
   */
  startPolling() {
    const token = config.TELEGRAM.BOT_TOKEN;
    if (!token) {
      logger.warn('Telegram bot token (BOT_TOKEN) is missing. Interactive bot listener is disabled.');
      return;
    }

    logger.info('Initializing interactive Telegram Bot listener (long polling)...');
    let offset = 0;

    // Run polling in an independent background loop
    (async () => {
      while (true) {
        try {
          const url = `https://api.telegram.org/bot${token}/getUpdates`;
          const response = await axios.get(url, {
            params: {
              offset: offset,
              timeout: 25, // 25s long polling timeout
            },
            timeout: 30000 // 30s connection timeout
          });

          const updates = response.data.result || [];
          for (const update of updates) {
            offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        } catch (error) {
          logger.error(`Error in Telegram polling listener: ${error.message}`);
          // Wait 5 seconds before retrying on network drops to prevent spamming
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    })();
  }

  /**
   * Processes an incoming Telegram update.
   * @param {Object} update - Raw update object from Telegram API.
   */
  async handleUpdate(update) {
    if (!update || !update.message) return;

    const message = update.message;
    const chatId = message.chat.id;
    const textRaw = message.text || '';
    const text = textRaw.trim();

    if (!text) return;

    const normalizedText = text.toLowerCase();
    
    try {
      // 1. Command: /start
      if (normalizedText === '/start') {
        const welcomeText = 
          `👋 Привет! Я бот автоматических отчетов продаж.\n\n` +
          `Я настроен присылать ежедневный отчет в 21:00.\n` +
          `Но вы можете запросить показатели на данный момент в любое время с помощью кнопок меню! 👇`;
        
        // Define a native Reply Keyboard with five buttons
        const replyMarkup = {
          keyboard: [
            [{ text: '📊 Получить актуальный отчет' }],
            [
              { text: '💰 Валовая прибыль за сегодня' },
              { text: '💰 Валовая прибыль ОП1' }
            ],
            [
              { text: '📞 Отчет по звонкам' },
              { text: '📊 Отчет по amoCRM' }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        };

        await this.sendMessage(chatId, welcomeText, replyMarkup);
        logger.info(`Welcomed user ${chatId} in private chat.`);
        return;
      }

      // 2. Command: /report or button "📊 Получить актуальный отчет"
      if (normalizedText === '/report' || normalizedText === '📊 получить актуальный отчет' || normalizedText.includes('получить отчет')) {
        logger.info(`User ${chatId} requested an instant report.`);
        
        // Send a temporary "loading" notice
        await this.sendMessage(chatId, '🔄 Секунду, подключаюсь к таблицам и формирую актуальный отчет...');
        
        try {
          // Dynamic import to avoid CommonJS circular dependencies
          const reportService = require('./report.service');
          
          // Generate report text string directly
          const reportText = await reportService.getReportText();
          
          // Send report text directly back to the requesting user/chat ID
          await this.sendMessage(chatId, reportText);
          logger.info(`Direct sales report successfully sent to chat ID: ${chatId}`);
        } catch (innerError) {
          logger.error(`Failed to generate direct report response: ${innerError.message}`);
          await this.sendMessage(
            chatId, 
            `⚠️ Ошибка при формировании отчета:\n${innerError.message}\n\n` +
            `Пожалуйста, убедитесь, что Google Apps Script Web App опубликован и доступен по адресу APPS_SCRIPT_URL.`
          );
        }
        return;
      }

      // 3. Command: /profit or button "💰 Валовая прибыль за сегодня"
      if (normalizedText === '/profit' || normalizedText === '💰 валовая прибыль за сегодня' || normalizedText.includes('прибыль за сегодня')) {
        logger.info(`User ${chatId} requested instant gross profit totals.`);

        // Send a temporary "loading" notice
        await this.sendMessage(chatId, '🔄 Секунду, подключаюсь к таблицам и рассчитываю прибыль...');

        try {
          // Dynamic import to avoid CommonJS circular dependencies
          const reportService = require('./report.service');
          
          // Generate profit summary text string directly
          const profitText = await reportService.getGrossProfitText();
          
          // Send profit summary directly back to the requesting user
          await this.sendMessage(chatId, profitText);
          logger.info(`Gross profit response successfully sent to chat ID: ${chatId}`);
        } catch (innerError) {
          logger.error(`Failed to generate profit response: ${innerError.message}`);
          await this.sendMessage(
            chatId, 
            `⚠️ Ошибка при расчете прибыли:\n${innerError.message}\n\n` +
            `Пожалуйста, убедитесь, что Google Apps Script Web App опубликован и доступен по адресу APPS_SCRIPT_URL.`
          );
        }
        return;
      }

      // 3.1. Command: /profit_op1 or button "💰 Валовая прибыль ОП1"
      if (normalizedText === '/profit_op1' || normalizedText === '💰 валовая прибыль оп1' || normalizedText.includes('прибыль оп1')) {
        logger.info(`User ${chatId} requested OP1 gross profit.`);

        await this.sendMessage(chatId, '🔄 Секунду, подключаюсь к таблице ОП1 и рассчитываю прибыль...');

        try {
          const reportService = require('./report.service');
          const profitText = await reportService.getGrossProfitOP1();
          await this.sendMessage(chatId, profitText);
          logger.info(`OP1 gross profit response successfully sent to chat ID: ${chatId}`);
        } catch (innerError) {
          logger.error(`Failed to generate OP1 profit response: ${innerError.message}`);
          await this.sendMessage(
            chatId, 
            `⚠️ Ошибка при расчете прибыли ОП1:\n${innerError.message}\n\n` +
            `Пожалуйста, убедитесь, что Google Apps Script Web App для ОП1 опубликован и доступен по адресу APPS_SCRIPT_URL_OP1.`
          );
        }
        return;
      }

      // 3.2. Command: /call_report or button "📞 Отчет по звонкам"
      if (normalizedText === '/call_report' || normalizedText === '📞 отчет по звонкам' || normalizedText.includes('отчет по звонкам')) {
        logger.info(`User ${chatId} requested an instant call report.`);
        
        await this.sendMessage(chatId, '🔄 Секунду, подключаюсь к Binotel и формирую отчет по звонкам...');
        
        try {
          const reportService = require('./report.service');
          const reportText = await reportService.getCallReportText();
          await this.sendMessage(chatId, reportText);
          logger.info(`Call report response successfully sent to chat ID: ${chatId}`);
        } catch (innerError) {
          logger.error(`Failed to generate call report response: ${innerError.message}`);
          await this.sendMessage(
            chatId, 
            `⚠️ Ошибка при формировании отчета по звонкам:\n${innerError.message}\n\n` +
            `Пожалуйста, убедитесь, что учетные данные REST API Binotel настроены в панели управления.`
          );
        }
        return;
      }

      // 3.3. Command: /amo_report or button "📊 Отчет по amoCRM"
      if (normalizedText === '/amo_report' || normalizedText === '📊 отчет по amocrm' || normalizedText.includes('отчет по amo')) {
        logger.info(`User ${chatId} requested an instant amoCRM report.`);
        
        await this.sendMessage(chatId, '🔄 Секунду, подключаюсь к amoCRM и формирую отчет по работе менеджеров...');
        
        try {
          const reportService = require('./report.service');
          const reportText = await reportService.getAmoReportText();
          await this.sendMessage(chatId, reportText);
          logger.info(`amoCRM report response successfully sent to chat ID: ${chatId}`);
        } catch (innerError) {
          logger.error(`Failed to generate amoCRM report response: ${innerError.message}`);
          await this.sendMessage(
            chatId, 
            `⚠️ Ошибка при формировании отчета amoCRM:\n${innerError.message}\n\n` +
            `Пожалуйста, убедитесь, что Субдомен и Токен доступа настроены в панели управления.`
          );
        }
        return;
      }
 
      // 4. Fallback for other text inputs
      const fallbackText = 
        `💡 Я понимаю только специальные команды.\n\n` +
        `Используйте кнопки меню:\n` +
        `• **📊 Получить актуальный отчет**\n` +
        `• **💰 Валовая прибыль за сегодня**\n` +
        `• **💰 Валовая прибыль ОП1**\n` +
        `• **📞 Отчет по звонкам**\n` +
        `• **📊 Отчет по amoCRM**`;
      
      await this.sendMessage(chatId, fallbackText);
    } catch (err) {
      logger.error(`Failed to handle Telegram update from chat ID ${chatId}: ${err.message}`);
    }
  }
}

module.exports = new TelegramService();
