const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Service to handle sending notifications and listening to interactive commands via Telegram Bot API.
 */
class TelegramService {
  constructor() {
    this.userStates = new Map(); // Stores user session states: chatId -> { mode: 'REPORT' | 'PROFIT_OP2' | 'PROFIT_OP1' }
  }

  /**
   * Generates a Reply Keyboard containing buttons for all days of the current month.
   * @returns {Object} Telegram reply_markup object.
   */
  buildMonthDaysKeyboard() {
    const formatter = require('../utils/formatter');
    const now = new Date();
    const currentDateStr = formatter.formatDate(now); // e.g. "11.08.2026"
    const [currDay, currMonth, currYear] = currentDateStr.split('.');
    
    const daysInMonth = new Date(parseInt(currYear, 10), parseInt(currMonth, 10), 0).getDate();
    
    const keyboard = [
      [{ text: `⚡ За сегодня (${currentDateStr})` }]
    ];
    
    let row = [];
    for (let d = 1; d <= daysInMonth; d++) {
      row.push({ text: `${d} число` });
      if (row.length === 5) {
        keyboard.push(row);
        row = [];
      }
    }
    if (row.length > 0) {
      keyboard.push(row);
    }
    
    keyboard.push([{ text: '⬅️ Назад в меню' }]);
    
    return {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }

  /**
   * Tries to parse a target date from user input text (e.g. "5 число", "5", "05.08.2026").
   * @param {string} text 
   * @returns {string|null} Formatted date "dd.MM.yyyy" or null.
   */
  parseTargetDate(text) {
    const formatter = require('../utils/formatter');
    const now = new Date();
    const currentDateStr = formatter.formatDate(now);
    const [, currMonth, currYear] = currentDateStr.split('.');

    const normalized = text.trim().toLowerCase();

    // 1. "⚡ За сегодня (11.08.2026)" or "за сегодня" or "сегодня"
    if (normalized.includes('за сегодня') || normalized === 'сегодня') {
      return currentDateStr;
    }

    // 2. Full date format "dd.mm.yyyy" (e.g. "05.08.2026")
    const fullDateMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (fullDateMatch) {
      const d = String(fullDateMatch[1]).padStart(2, '0');
      const m = String(fullDateMatch[2]).padStart(2, '0');
      const y = fullDateMatch[3];
      return `${d}.${m}.${y}`;
    }

    // 3. Short date format "dd.mm" (e.g. "05.08")
    const shortDateMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})$/);
    if (shortDateMatch) {
      const d = String(shortDateMatch[1]).padStart(2, '0');
      const m = String(shortDateMatch[2]).padStart(2, '0');
      return `${d}.${m}.${currYear}`;
    }

    // 4. Day number format "5 число", "5", "05"
    const dayMatch = normalized.match(/^(\d{1,2})\s*(число|числа|день)?$/i);
    if (dayMatch) {
      const dayNum = parseInt(dayMatch[1], 10);
      if (dayNum >= 1 && dayNum <= 31) {
        const d = String(dayNum).padStart(2, '0');
        return `${d}.${currMonth}.${currYear}`;
      }
    }

    return null;
  }

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
   * @param {string} [parseMode] - Optional parse mode (e.g., 'Markdown').
   * @returns {Promise<Object>} Telegram API response data.
   */
  async sendMessage(chatId, text, replyMarkup = null, parseMode = null) {
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

    if (parseMode) {
      payload.parse_mode = parseMode;
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
      // 1. Command: /start or Return to Main Menu
      if (normalizedText === '/start' || normalizedText === '⬅️ назад в меню' || normalizedText === 'назад в меню') {
        this.userStates.delete(chatId);
        const welcomeText = 
          `👋 Привет! Я бот автоматических отчетов продаж.\n\n` +
          `Я настроен присылать ежедневный отчет в 21:00.\n` +
          `Но вы можете запросить показатели за любой день текущего месяца с помощью кнопок меню! 👇`;
        
        // Define a native Reply Keyboard with six buttons
        const replyMarkup = {
          keyboard: [
            [{ text: '📊 Получить актуальный отчет' }, { text: '📋 Отчеты РНП' }],
            [
              { text: '💰 Валовая прибыль ОП2' },
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

      // 2. Command: /report or button "📊 Получить актуальный отчет" -> Opens Date Submenu
      if (normalizedText === '📊 получить актуальный отчет' || normalizedText === '/report' || normalizedText === 'получить отчет') {
        this.userStates.set(chatId, { mode: 'REPORT' });
        logger.info(`User ${chatId} opened date menu for Sales Report.`);
        const dateMarkup = this.buildMonthDaysKeyboard();
        const msgText = 
          `📊 *Отчет продаж — Выбор даты*\n\n` +
          `Выберите интересующий день текущего месяца с помощью кнопок ниже или нажмите «⚡ За сегодня»:`;
        await this.sendMessage(chatId, msgText, dateMarkup, 'Markdown');
        return;
      }

      // 3. Command: /profit or button "💰 Валовая прибыль ОП2" -> Opens Date Submenu
      if (normalizedText === '💰 валовая прибыль оп2' || normalizedText === '/profit' || normalizedText === 'прибыль оп2') {
        this.userStates.set(chatId, { mode: 'PROFIT_OP2' });
        logger.info(`User ${chatId} opened date menu for Gross Profit OP2.`);
        const dateMarkup = this.buildMonthDaysKeyboard();
        const msgText = 
          `💰 *Валовая прибыль ОП2 — Выбор даты*\n\n` +
          `Выберите интересующий день текущего месяца с помощью кнопок ниже или нажмите «⚡ За сегодня»:`;
        await this.sendMessage(chatId, msgText, dateMarkup, 'Markdown');
        return;
      }

      // 3.1. Command: /profit_op1 or button "💰 Валовая прибыль ОП1" -> Opens Date Submenu
      if (normalizedText === '💰 валовая прибыль оп1' || normalizedText === '/profit_op1' || normalizedText === 'прибыль оп1') {
        this.userStates.set(chatId, { mode: 'PROFIT_OP1' });
        logger.info(`User ${chatId} opened date menu for Gross Profit OP1.`);
        const dateMarkup = this.buildMonthDaysKeyboard();
        const msgText = 
          `💰 *Валовая прибыль ОП1 — Выбор даты*\n\n` +
          `Выберите интересующий день текущего месяца с помощью кнопок ниже или нажмите «⚡ За сегодня»:`;
        await this.sendMessage(chatId, msgText, dateMarkup, 'Markdown');
        return;
      }

      // 3.2. Command: /call_report or button "📞 Отчет по звонкам"
      if (normalizedText === '/call_report' || normalizedText === '📞 отчет по звонкам' || normalizedText.includes('отчет по звонкам')) {
        this.userStates.delete(chatId);
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
        this.userStates.delete(chatId);
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

      // 3.4. Command: /rnp or button "📋 Отчеты РНП"
      if (normalizedText === '/rnp' || normalizedText === '📋 отчеты рнп' || normalizedText === 'отчеты рнп') {
        this.userStates.delete(chatId);
        logger.info(`User ${chatId} opened RNP submenu.`);
        const rnpWelcomeText = 
          `📋 *Отчетность РНП по менеджерам*\n\n` +
          `Выберите интересующий вас тип проверки с помощью кнопок ниже:`;
        
        const rnpMarkup = {
          keyboard: [
            [{ text: '📋 Проверить отчетность' }],
            [{ text: '❌ Кто не заполнял РНП' }],
            [{ text: '⬅️ Назад в меню' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        };

        await this.sendMessage(chatId, rnpWelcomeText, rnpMarkup, 'Markdown');
        return;
      }

      // 3.5. Command: button "📋 Проверить отчетность"
      if (normalizedText === '📋 проверить отчетность' || normalizedText.includes('проверить отчетность')) {
        this.userStates.delete(chatId);
        logger.info(`User ${chatId} requested RNP reporting status.`);
        await this.sendMessage(chatId, '🔄 Секунду, подключаюсь к онлайн-таблице и формирую отчет по отчетности РНП...');
        try {
          const rnpService = require('./rnp.service');
          const reportText = await rnpService.getReportingStatus();
          await this.sendMessage(chatId, reportText, null, 'Markdown');
          logger.info(`RNP status report successfully sent to chat ID: ${chatId}`);
        } catch (innerError) {
          logger.error(`Failed to generate RNP reporting status report: ${innerError.message}`);
          await this.sendMessage(chatId, `⚠️ Ошибка при формировании отчета РНП: ${innerError.message}`);
        }
        return;
      }

      // 3.6. Command: button "❌ Кто не заполнял РНП"
      if (normalizedText === '❌ кто не заполнял рнп' || normalizedText.includes('кто не заполнял рнп') || normalizedText.includes('кто в какие дни не заполнял')) {
        this.userStates.delete(chatId);
        logger.info(`User ${chatId} requested RNP missed days.`);
        await this.sendMessage(chatId, '🔄 Секунду, подключаюсь к онлайн-таблице и рассчитываю пропуски РНП...');
        try {
          const rnpService = require('./rnp.service');
          const reportText = await rnpService.getMissedDays();
          await this.sendMessage(chatId, reportText, null, 'Markdown');
          logger.info(`RNP missed days report successfully sent to chat ID: ${chatId}`);
        } catch (innerError) {
          logger.error(`Failed to generate RNP missed days report: ${innerError.message}`);
          await this.sendMessage(chatId, `⚠️ Ошибка при формировании отчета РНП: ${innerError.message}`);
        }
        return;
      }

      // 3.7. Handle Date Selection for Active User Mode (REPORT, PROFIT_OP2, PROFIT_OP1)
      const userState = this.userStates.get(chatId);
      const targetDateStr = this.parseTargetDate(text);

      if (userState && targetDateStr) {
        const mode = userState.mode;
        const reportService = require('./report.service');

        if (mode === 'REPORT') {
          logger.info(`User ${chatId} requested report for date: ${targetDateStr}`);
          await this.sendMessage(chatId, `🔄 Секунду, подключаюсь к таблицам и формирую отчет за ${targetDateStr}...`);
          try {
            const reportText = await reportService.getReportText(targetDateStr);
            await this.sendMessage(chatId, reportText);
          } catch (innerError) {
            logger.error(`Failed to generate report for date ${targetDateStr}: ${innerError.message}`);
            await this.sendMessage(chatId, `⚠️ Ошибка при формировании отчета за ${targetDateStr}:\n${innerError.message}`);
          }
          return;
        }

        if (mode === 'PROFIT_OP2') {
          logger.info(`User ${chatId} requested OP2 profit for date: ${targetDateStr}`);
          await this.sendMessage(chatId, `🔄 Секунду, подключаюсь к таблицам и рассчитываю прибыль ОП2 за ${targetDateStr}...`);
          try {
            const profitText = await reportService.getGrossProfitText(targetDateStr);
            await this.sendMessage(chatId, profitText);
          } catch (innerError) {
            logger.error(`Failed to generate OP2 profit for date ${targetDateStr}: ${innerError.message}`);
            await this.sendMessage(chatId, `⚠️ Ошибка при расчете прибыли ОП2 за ${targetDateStr}:\n${innerError.message}`);
          }
          return;
        }

        if (mode === 'PROFIT_OP1') {
          logger.info(`User ${chatId} requested OP1 profit for date: ${targetDateStr}`);
          await this.sendMessage(chatId, `🔄 Секунду, подключаюсь к таблице ОП1 и рассчитываю прибыль за ${targetDateStr}...`);
          try {
            const profitText = await reportService.getGrossProfitOP1(targetDateStr);
            await this.sendMessage(chatId, profitText);
          } catch (innerError) {
            logger.error(`Failed to generate OP1 profit for date ${targetDateStr}: ${innerError.message}`);
            await this.sendMessage(chatId, `⚠️ Ошибка при расчете прибыли ОП1 за ${targetDateStr}:\n${innerError.message}`);
          }
          return;
        }
      }

      // 4. Fallback for other text inputs
      const fallbackText = 
        `💡 Я понимаю только специальные команды.\n\n` +
        `Используйте кнопки меню:\n` +
        `• **📊 Получить актуальный отчет**\n` +
        `• **📋 Отчеты РНП**\n` +
        `• **💰 Валовая прибыль ОП2**\n` +
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

