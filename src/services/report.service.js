const axios = require('axios');
const config = require('../config/config');
const sheetsService = require('./sheets.service');
const telegramService = require('./telegram.service');
const formatter = require('../utils/formatter');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

class ReportService {
  /**
   * Generates sales statistics report for a specific date and sends it to Telegram.
   * If no date is provided, defaults to the current date in Asia/Almaty timezone.
   * @param {string} [targetDateStr] - Format "dd.MM.yyyy" (e.g. "26.05.2026")
   * @returns {Promise<{success: boolean, text: string, telegramResults?: any, error?: string}>}
   */
  async generateAndSendReport(targetDateStr = null) {
    try {
      // 1. Resolve date
      const dateToProcess = targetDateStr || formatter.formatDate(new Date());
      logger.info(`Running sales report generation for date: ${dateToProcess}`);

      // 2. Fetch data from Google Sheets
      const rawData = await sheetsService.fetchSheetsData(dateToProcess);
      
      // 3. Process and aggregate data
      const reportData = this.aggregateData(rawData, dateToProcess);

      // 4. Construct the report text
      const reportText = this.buildReportMessage(reportData, dateToProcess);
      logger.info('--- GENERATED REPORT ---');
      console.log(reportText);
      logger.info('------------------------');

      // 5. Send report to Telegram
      let telegramResults = null;
      if (reportData.totalSalesCount > 0 || reportData.totalDvdCount > 0 || reportData.totalGross > 0) {
        telegramResults = await telegramService.sendReport(reportText);
      } else {
        logger.warn(`No active sales or data found for date ${dateToProcess}. Report sent with zero-state.`);
        telegramResults = await telegramService.sendReport(reportText);
      }

      return {
        success: true,
        text: reportText,
        telegramResults
      };
    } catch (error) {
      logger.error('Failed to generate or send report:', error.message);
      return {
        success: false,
        error: error.message,
        text: `Ошибка генерации отчета: ${error.message}`
      };
    }
  }

  /**
   * Fetches data and constructs the report text only (without global broadcasts).
   * Perfect for direct interactive Telegram bot replies.
   * @param {string} [targetDateStr] - Format "dd.MM.yyyy"
   * @returns {Promise<string>} Fully formatted report message.
   */
  async getReportText(targetDateStr = null) {
    const dateToProcess = targetDateStr || formatter.formatDate(new Date());
    const rawData = await sheetsService.fetchSheetsData(dateToProcess);
    const reportData = this.aggregateData(rawData, dateToProcess);
    return this.buildReportMessage(reportData, dateToProcess);
  }

  /**
   * Fetches data and constructs a compact financial summary of gross profit.
   * Calculates active sales (renewals) and cancellations separately and provides total daily progress.
   * @param {string} [targetDateStr] - Format "dd.MM.yyyy"
   * @returns {Promise<string>} Fully formatted gross profit message.
   */
  async getGrossProfitText(targetDateStr = null) {
    const dateToProcess = targetDateStr || formatter.formatDate(new Date());
    const rawData = await sheetsService.fetchSheetsData(dateToProcess);
    const reportData = this.aggregateData(rawData, dateToProcess);

    // Calculate renewals totals (everything except 'Отмены')
    let renewalsGross = 0;
    let renewalsSales = 0;

    for (const catName in reportData.categories) {
      if (catName !== 'Отмены') {
        renewalsGross += reportData.categories[catName].gross;
        renewalsSales += reportData.categories[catName].sales;
      }
    }

    const cancellations = reportData.categories['Отмены'] || { gross: 0, sales: 0 };
    const cancellationsGross = cancellations.gross;
    const cancellationsSales = cancellations.sales;

    let msg = `💰 ВАЛОВАЯ ПРИБЫЛЬ ЗА СЕГОДНЯ\n\n`;
    msg += `Дата: ${dateToProcess}\n\n`;
    msg += `📈 Продления (активные продажи):\n`;
    msg += `• Вал: ${formatter.formatCurrency(renewalsGross)}\n`;
    msg += `• Закрыто сделок: ${renewalsSales}\n\n`;
    msg += `📉 Отмены (возвраты):\n`;
    msg += `• Вал: ${formatter.formatCurrency(cancellationsGross)}\n`;
    msg += `• Закрыто сделок: ${cancellationsSales}\n\n`;
    msg += `━━━━━━━━━━━━━━\n\n`;
    msg += `🏆 ОБЩИЙ ИТОГ ЗА СЕГОДНЯ:\n`;
    msg += `• Общий вал: ${formatter.formatCurrency(reportData.totalGross)}\n`;
    msg += `• Всего сделок: ${reportData.totalSalesCount}\n\n`;
    msg += `Отчет сформирован автоматически`;

    return msg;
  }

  /**
   * Aggregates raw sheets data.
   * @param {Object} rawData - Map of sheetName -> rows
   * @param {string} dateToProcess - Format "dd.MM.yyyy"
   */
  aggregateData(rawData, dateToProcess) {
    const activeSheets = [];
    
    // Overall Stats
    let totalGross = 0;
    let totalSalesCount = 0;
    let totalDvdCount = 0;

    // Categories Initialization
    const categories = {
      'УЛИЦА': {
        name: 'УЛИЦА',
        gross: 0,
        sales: 0,
        entered: 0,
        dvd: 0,
        avgCheck: 0,
        order: 1,
        type: 'street'
      },
      'Продления МВМ': {
        name: 'Продления МВМ',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 2,
        type: 'standard'
      },
      'Продления Повторка': {
        name: 'Продления Повторка',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 3,
        type: 'standard'
      },
      'Сарафанка': {
        name: 'Сарафанка',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 4,
        type: 'standard'
      },
      'Форсировка': {
        name: 'Форсировка',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 5,
        type: 'standard'
      },
      'Доплата / Предоплата': {
        name: 'Доплата / Предоплата',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 6,
        type: 'standard'
      },
      'Отмены': {
        name: 'Отмены',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 7,
        type: 'standard'
      }
    };

    let processedRowsCount = 0;

    // Loop through each sheet
    for (const [sheetName, rows] of Object.entries(rawData)) {
      if (!rows || rows.length <= 1) continue;

      let sheetHasDataForDay = false;

      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Extract and format cell coordinates
        const rowDateRaw = row[7]; // H - Дата (Index 7)
        if (!rowDateRaw) continue;

        const rowDateTrimmed = String(rowDateRaw).trim();
        if (rowDateTrimmed !== dateToProcess) continue;

        const grossVal = helpers.parseNumber(row[9]); // J - ВАЛ (Index 9)
        if (grossVal <= 0) continue;

        processedRowsCount++;
        sheetHasDataForDay = true;

        // Sum overall metrics
        totalGross += grossVal;
        totalSalesCount++;

        // DVD Agreement check
        const contractRaw = row[10]; // K - ДОГОВОР (Index 10)
        const isDvd = helpers.normalizeString(contractRaw) === 'оферта отправлена';
        if (isDvd) {
          totalDvdCount++;
        }

        // Determine category based on sheet name and lead source
        let categoryKey = null;
        const normalizedSheetName = sheetName.toLowerCase();

        if (normalizedSheetName.includes('отмен')) {
          // Rule: All rows in the 'Отмены' sheet belong to the 'Отмены' category
          categoryKey = 'Отмены';
        } else {
          // Standard active sales categories from the 'Продления' sheet
          const leadSourceRaw = row[3]; // D - ОТКУДА ЛИД (Index 3)
          const leadSource = helpers.normalizeString(leadSourceRaw);

          if (leadSource === 'улица') {
            categoryKey = 'УЛИЦА';
          } else if (leadSource.includes('мвм')) {
            categoryKey = 'Продления МВМ';
          } else if (leadSource.includes('повторка')) {
            categoryKey = 'Продления Повторка';
          } else if (leadSource.includes('сарафанка')) {
            categoryKey = 'Сарафанка';
          } else if (leadSource.includes('форсировка')) {
            categoryKey = 'Форсировка';
          } else if (leadSource.includes('доплат') || leadSource.includes('предоплат')) {
            categoryKey = 'Доплата / Предоплата';
          }
        }

        if (categoryKey) {
          const cat = categories[categoryKey];
          cat.gross += grossVal;
          cat.sales++;

          if (cat.type === 'street') {
            cat.entered++;
            if (isDvd) {
              cat.dvd++;
            }
          }
        }
      }

      if (sheetHasDataForDay) {
        activeSheets.push(sheetName);
      }
    }

    logger.info(`Processed ${processedRowsCount} rows matching date: ${dateToProcess}`);

    // Calculate average checks
    const overallAvgCheck = totalSalesCount > 0 ? (totalGross / totalSalesCount) : 0;

    for (const catName in categories) {
      const cat = categories[catName];
      cat.avgCheck = cat.sales > 0 ? (cat.gross / cat.sales) : 0;
    }

    // Determine default sheets if activeSheets is empty
    let fallbackSheets = ['Общие продажи Май (Продления)', 'Общие продажи Май (Отмены)'];
    try {
      const parts = dateToProcess.split('.');
      const month = parts[1];
      const months = {
        '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
        '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
        '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
      };
      const monthName = months[month] || 'Май';
      fallbackSheets = [
        `Общие продажи ${monthName} (Продления)`,
        `Общие продажи ${monthName} (Отмены)`
      ];
    } catch (e) {}

    return {
      activeSheets: activeSheets.length > 0 ? activeSheets : fallbackSheets,
      totalGross,
      totalSalesCount,
      averageCheck: overallAvgCheck,
      totalDvdCount,
      categories
    };
  }

  /**
   * Builds the strict text message report string.
   * @param {Object} data - Processed aggregations.
   * @param {string} dateToProcess - Format "dd.MM.yyyy"
   * @returns {string} Fully formatted report message.
   */
  buildReportMessage(data, dateToProcess) {
    const sheetsStr = data.activeSheets.join(' / ');

    let msg = `ОТЧЕТ ПРОДАЖ\n\n`;
    msg += `Дата: ${dateToProcess}\n`;
    msg += `Листы: ${sheetsStr}\n\n`;
    msg += `Общий вал: ${formatter.formatCurrency(data.totalGross)}\n`;
    msg += `Общие продажи: ${data.totalSalesCount}\n`;
    msg += `Средний чек: ${formatter.formatCurrency(data.averageCheck)}\n`;

    // Sort categories by predefined order (1 to 6)
    const sortedCategories = Object.values(data.categories)
      .sort((a, b) => a.order - b.order);

    for (const cat of sortedCategories) {
      // Rule 16: If category has 0 sales and 0 gross, omit it
      if (cat.sales === 0 && cat.gross === 0) {
        continue;
      }

      msg += `\n━━━━━━━━━━━━━━\n\n`;
      msg += `${cat.name}\n\n`;
      msg += `Вал: ${formatter.formatCurrency(cat.gross)}\n`;

      if (cat.type === 'street') {
        msg += `Продажи: ${cat.sales}\n`;
        msg += `Кол-во зашедших: ${cat.entered}\n`;
        msg += `Продажи ДВД: ${cat.dvd}\n`;
      } else {
        msg += `Продажи: ${cat.sales}\n`;
      }

      msg += `Средний чек: ${formatter.formatCurrency(cat.avgCheck)}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━\n\n`;
    msg += `ДВД отправлено: ${data.totalDvdCount}\n\n`;
    msg += `Отчет сформирован автоматически`;

    return msg;
  }

  /**
   * Fetches data from the OP1 spreadsheet and calculates its gross profit.
   * Calculates both today's gross and total accumulated month-to-date gross.
   * @param {string} [targetDateStr] - Format "dd.MM.yyyy"
   * @returns {Promise<string>} Fully formatted gross profit message for OP1.
   */
  async getGrossProfitOP1(targetDateStr = null) {
    const dateToProcess = targetDateStr || formatter.formatDate(new Date());
    const webAppUrlOP1 = config.APPS_SCRIPT_URL_OP1;

    if (!webAppUrlOP1) {
      logger.error('OP1 Google Apps Script Web App URL (APPS_SCRIPT_URL_OP1) is not configured.');
      return `⚠️ Ссылка для подключения к таблице ОП1 (APPS_SCRIPT_URL_OP1) не настроена в файле .env.`;
    }

    try {
      logger.info(`Fetching OP1 spreadsheet data for date: ${dateToProcess}...`);
      const response = await axios.get(webAppUrlOP1, {
        params: { date: dateToProcess },
        timeout: 25000 // 25s timeout for Google Apps Script execution limits
      });

      if (response.data && response.data.ok) {
        logger.info('OP1 spreadsheet data successfully fetched.');
        const rawData = response.data.data || {};
        
        let todayGross = 0;
        let todaySalesCount = 0;
        let totalAccumulatedGross = 0;
        let totalAccumulatedSalesCount = 0;
        let activeSheetName = '';

        for (const [sheetName, rows] of Object.entries(rawData)) {
          if (!rows || rows.length <= 1) continue;
          
          activeSheetName = sheetName;

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 11) continue;

            // I - ДАТА (Index 8 in the second table)
            const rowDateRaw = row[8];
            if (!rowDateRaw) continue;

            const rowDateTrimmed = String(rowDateRaw).trim();

            // K - ВАЛ (Index 10 in the second table)
            const grossVal = helpers.parseNumber(row[10]);
            if (grossVal <= 0) continue;

            // Accumulate for month-to-date
            totalAccumulatedGross += grossVal;
            totalAccumulatedSalesCount++;

            // Accumulate for today
            if (rowDateTrimmed === dateToProcess) {
              todayGross += grossVal;
              todaySalesCount++;
            }
          }
        }

        let msg = `💰 ВАЛОВАЯ ПРИБЫЛЬ ОП1\n\n`;
        msg += `Дата: ${dateToProcess}\n`;
        if (activeSheetName) {
          msg += `Лист: ${activeSheetName}\n`;
        }
        msg += `\n`;
        msg += `📈 За сегодня:\n`;
        msg += `• Вал: ${formatter.formatCurrency(todayGross)}\n`;
        msg += `• Продажи: ${todaySalesCount}\n\n`;
        msg += `🏆 Всего за месяц:\n`;
        msg += `• Общий вал: ${formatter.formatCurrency(totalAccumulatedGross)}\n`;
        msg += `• Всего сделок: ${totalAccumulatedSalesCount}\n\n`;
        msg += `Отчет сформирован автоматически`;

        return msg;
      } else {
        const errMsg = response.data ? response.data.error : 'unknown error';
        logger.error(`Apps Script Web App for OP1 returned an error: ${errMsg}`);
        throw new Error(errMsg);
      }
    } catch (error) {
      logger.error(`Failed to fetch or calculate OP1 gross profit: ${error.message}`);
      return `⚠️ Ошибка при получении данных ОП1:\n${error.message}\n\nПожалуйста, проверьте APPS_SCRIPT_URL_OP1 и публикацию веб-приложения.`;
    }
  }
}

module.exports = new ReportService();
