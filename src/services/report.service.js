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

      // 2. Fetch data from Google Sheets (throws on failure after retries)
      let rawData;
      try {
        rawData = await sheetsService.fetchSheetsData(dateToProcess);
      } catch (fetchError) {
        // Data fetching completely failed — do NOT send a zero report
        logger.error(`❌ Data fetch failed for date ${dateToProcess}: ${fetchError.message}`);
        
        const errorNotification = `⚠️ ОШИБКА ПОЛУЧЕНИЯ ДАННЫХ\n\n` +
          `Дата: ${dateToProcess}\n` +
          `Не удалось получить данные из Google Sheets.\n` +
          `Причина: ${fetchError.message}\n\n` +
          `Отчёт НЕ отправлен. Проверьте подключение к таблице.`;
        
        await telegramService.sendReport(errorNotification);
        
        return {
          success: false,
          error: fetchError.message,
          text: errorNotification
        };
      }

      // 3. Process and aggregate data
      const reportData = this.aggregateData(rawData, dateToProcess);

      // 4. Construct the report text
      const reportText = this.buildReportMessage(reportData, dateToProcess);
      logger.info('--- GENERATED REPORT ---');
      console.log(reportText);
      logger.info('------------------------');

      // 5. Send report to Telegram
      if (reportData.totalSalesCount === 0 && reportData.totalDvdCount === 0 && reportData.totalGross === 0) {
        logger.warn(`No sales data found for date ${dateToProcess}. Data was fetched successfully but is empty for this date.`);
      }
      
      const telegramResults = await telegramService.sendReport(reportText);

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
    try {
      const rawData = await sheetsService.fetchSheetsData(dateToProcess);
      const reportData = this.aggregateData(rawData, dateToProcess);
      return this.buildReportMessage(reportData, dateToProcess);
    } catch (error) {
      logger.error(`Failed to get report text for ${dateToProcess}: ${error.message}`);
      return `⚠️ Не удалось получить данные из таблицы для даты ${dateToProcess}.\nПричина: ${error.message}\n\nПопробуйте ещё раз через минуту.`;
    }
  }

  /**
   * Fetches data and constructs a compact financial summary of gross profit.
   * Calculates active sales (renewals) and cancellations separately and provides total daily progress.
   * @param {string} [targetDateStr] - Format "dd.MM.yyyy"
   * @returns {Promise<string>} Fully formatted gross profit message.
   */
  async getGrossProfitText(targetDateStr = null) {
    const dateToProcess = targetDateStr || formatter.formatDate(new Date());
    let rawData;
    try {
      rawData = await sheetsService.fetchSheetsData(dateToProcess);
    } catch (error) {
      logger.error(`Failed to get gross profit data for ${dateToProcess}: ${error.message}`);
      return `⚠️ Не удалось получить данные из таблицы для даты ${dateToProcess}.\nПричина: ${error.message}\n\nПопробуйте ещё раз через минуту.`;
    }
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

    // Clean and extract unique sheet names for the display header
    const uniqueCleanSheets = [...new Set(reportData.activeSheets.map(s => 
      s.replace(/\s*\(продления\)/gi, '').replace(/\s*\(отмены\)/gi, '').trim()
    ))];
    const sheetsStr = uniqueCleanSheets.join(' / ');

    let msg = `Дата: ${dateToProcess}\n`;
    msg += `Лист: ${sheetsStr}\n\n`;
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
    msg += `🏆 Всего за месяц:\n`;
    msg += `• Общий вал продление: ${formatter.formatCurrency(reportData.monthlyRenewalsGross)}\n`;
    msg += `• Общий вал отмены: ${formatter.formatCurrency(reportData.monthlyCancellationsGross)}\n`;
    msg += `• Общий вал Отмена+Продление: ${formatter.formatCurrency(reportData.monthlyTotalGross)}\n`;
    msg += `• Всего сделок: ${reportData.monthlyTotalSalesCount}\n\n`;
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

    // Monthly Stats
    let monthlyRenewalsGross = 0;
    let monthlyRenewalsSales = 0;
    let monthlyCancellationsGross = 0;
    let monthlyCancellationsSales = 0;

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
      'Гостевой': {
        name: 'Гостевой',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 7,
        type: 'standard'
      },
      'Обучение на фитнес тренера': {
        name: 'Обучение на фитнес тренера',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 8,
        type: 'standard'
      },
      'Таргет': {
        name: 'Таргет',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 9,
        type: 'standard'
      },
      '2ГИС': {
        name: '2ГИС',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 10,
        type: 'standard'
      },
      'Прямой переход': {
        name: 'Прямой переход',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 11,
        type: 'standard'
      },
      'Флоктори': {
        name: 'Флоктори',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 12,
        type: 'standard'
      },
      'Самообращение': {
        name: 'Самообращение',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 13,
        type: 'standard'
      },
      'Тильда': {
        name: 'Тильда',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 14,
        type: 'standard'
      },
      'Таплинк': {
        name: 'Таплинк',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 15,
        type: 'standard'
      },
      'ВП таргет': {
        name: 'ВП таргет',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 16,
        type: 'standard'
      },
      'Другое': {
        name: 'Другое',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 17,
        type: 'standard'
      },
      'Отмены': {
        name: 'Отмены',
        gross: 0,
        sales: 0,
        avgCheck: 0,
        order: 99,
        type: 'standard'
      }
    };

    let processedRowsCount = 0;

    // Loop through each sheet
    for (const [sheetName, rows] of Object.entries(rawData)) {
      if (!rows || rows.length <= 1) continue;

      const normalizedSheetName = sheetName.toLowerCase();
      const configuredOtmenSheet = config.SHEET_OTMEN;
      const configuredProdSheet = config.SHEET_PROD;
      
      if (normalizedSheetName.includes('отмен')) {
        if (configuredOtmenSheet && sheetName !== configuredOtmenSheet) {
          continue; // Пропускаем, если задан конкретный лист отмен и имя не совпадает
        }
      } else {
        if (configuredProdSheet && sheetName !== configuredProdSheet) {
          continue; // Пропускаем, если задан конкретный лист продлений и имя не совпадает
        }
      }

      let sheetHasDataForDay = false;

      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Extract and format cell coordinates
        const rowDateRaw = row[7]; // H - Дата (Index 7)
        if (!rowDateRaw) continue;

        const rowDateTrimmed = String(rowDateRaw).trim();

        const grossVal = helpers.parseNumber(row[9]); // J - ВАЛ (Index 9)
        if (grossVal <= 0) continue;

        // Monthly accumulation
        const parts = rowDateTrimmed.split('.');
        const targetParts = dateToProcess.split('.');
        const isSameMonth = parts.length === 3 && targetParts.length === 3 && parts[1] === targetParts[1] && parts[2] === targetParts[2];
        if (isSameMonth) {
          if (normalizedSheetName.includes('отмен')) {
            monthlyCancellationsGross += grossVal;
            monthlyCancellationsSales++;
          } else {
            monthlyRenewalsGross += grossVal;
            monthlyRenewalsSales++;
          }
        }

        // Daily accumulation filter
        if (rowDateTrimmed !== dateToProcess) continue;

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
          } else if (leadSource.includes('гостевой')) {
            categoryKey = 'Гостевой';
          } else if (leadSource.includes('тренер') || leadSource.includes('обучение')) {
            categoryKey = 'Обучение на фитнес тренера';
          } else if (leadSource.includes('вп таргет') || leadSource.includes('вптаргет')) {
            categoryKey = 'ВП таргет';
          } else if (leadSource.includes('таргет')) {
            categoryKey = 'Таргет';
          } else if (leadSource.includes('2гис') || leadSource.includes('2gis')) {
            categoryKey = '2ГИС';
          } else if (leadSource.includes('прямой')) {
            categoryKey = 'Прямой переход';
          } else if (leadSource.includes('флок')) { // Handles "флоктори", "флоктари", etc.
            categoryKey = 'Флоктори';
          } else if (leadSource.includes('самообращение')) {
            categoryKey = 'Самообращение';
          } else if (leadSource.includes('тильда') || leadSource.includes('tilda')) {
            categoryKey = 'Тильда';
          } else if (leadSource.includes('таплинк') || leadSource.includes('taplink')) {
            categoryKey = 'Таплинк';
          } else if (leadSource.includes('другое') || leadSource.includes('примечани')) {
            categoryKey = 'Другое';
          } else if (leadSourceRaw && leadSourceRaw.trim()) {
            // Dynamic fallback for any unhandled new channel name from table
            const rawTitle = leadSourceRaw.trim();
            if (!categories[rawTitle]) {
              categories[rawTitle] = {
                name: rawTitle,
                gross: 0,
                sales: 0,
                avgCheck: 0,
                order: 80,
                type: 'standard'
              };
            }
            categoryKey = rawTitle;
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
      categories,
      monthlyRenewalsGross,
      monthlyRenewalsSales,
      monthlyCancellationsGross,
      monthlyCancellationsSales,
      monthlyTotalGross: monthlyRenewalsGross + monthlyCancellationsGross,
      monthlyTotalSalesCount: monthlyRenewalsSales + monthlyCancellationsSales
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
        params: { 
          date: dateToProcess,
          sheetOp1: config.SHEET_OP1 || ''
        },
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

        const configuredOp1Sheet = config.SHEET_OP1;

        for (const [sheetName, rows] of Object.entries(rawData)) {
          if (!rows || rows.length <= 1) continue;
          
          if (configuredOp1Sheet && sheetName !== configuredOp1Sheet) {
            continue; // Пропускаем, если задан конкретный лист ОП1 и имя не совпадает
          }
          
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

  /**
   * Fetches call statistics from Binotel API and aggregates report for active managers.
   * @param {string} [targetDateStr] - Date formatted as "dd.MM.yyyy"
   * @returns {Promise<string>} Fully formatted Telegram message
   */
  async getCallReportText(targetDateStr = null) {
    const dateToProcess = targetDateStr || formatter.formatDate(new Date());
    logger.info(`Generating call report for managers on date: ${dateToProcess}`);

    // Check credentials first
    if (!config.BINOTEL_API_KEY || !config.BINOTEL_API_SECRET || !config.BINOTEL_COMPANY_ID) {
      return `📞 ОТЧЕТ ПО ЗВОНКАМ МЕНЕДЖЕРОВ\n\nДата: ${dateToProcess}\n\n⚠️ Учетные данные Binotel API не настроены в панели управления. Пожалуйста, сохраните API-key, API-secret и Company ID.`;
    }

    // Parse date parts and calculate local day range timestamps
    let startTime, stopTime;
    try {
      const [day, month, year] = dateToProcess.split('.').map(Number);
      
      const getTimestampForLocalTime = (y, m, d, h, min, sec, tz) => {
        let guess = Date.UTC(y, m - 1, d, h, min, sec);
        const effectiveTz = formatter.normalizeTimezone(tz || config.TIMEZONE);
        const formatterInstance = new Intl.DateTimeFormat('en-US', {
          timeZone: effectiveTz,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false
        });
        const parts = formatterInstance.formatToParts(new Date(guess));
        const partVal = (type) => parseInt(parts.find(p => p.type === type).value, 10);
        const fYear = partVal('year');
        const fMonth = partVal('month');
        const fDay = partVal('day');
        const fHour = partVal('hour') % 24;
        const fMin = partVal('minute');
        const fSec = partVal('second');
        const formattedUTC = Date.UTC(fYear, fMonth - 1, fDay, fHour, fMin, fSec);
        const diff = formattedUTC - guess;
        return Math.floor((guess - diff) / 1000);
      };

      startTime = getTimestampForLocalTime(year, month, day, 0, 0, 0, config.TIMEZONE);
      stopTime = getTimestampForLocalTime(year, month, day, 23, 59, 59, config.TIMEZONE);
    } catch (err) {
      logger.error('Failed to parse date range for Binotel calls:', err.message);
      return `⚠️ Не удалось разобрать дату ${dateToProcess} для формирования отчета по звонкам.`;
    }

    try {
      const binotelService = require('./binotel.service');
      logger.info(`Fetching calls for range: ${startTime} to ${stopTime}`);
      
      const [employees, calls] = await Promise.all([
        binotelService.fetchEmployees(),
        binotelService.fetchCallsForPeriod(startTime, stopTime)
      ]);

      const activeEmails = config.BINOTEL_ACTIVE_MANAGERS
        ? config.BINOTEL_ACTIVE_MANAGERS.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0)
        : [];

      if (activeEmails.length === 0) {
        return `📞 ОТЧЕТ ПО ЗВОНКАМ МЕНЕДЖЕРОВ\n\nДата: ${dateToProcess}\n\n⚠️ В веб-интерфейсе не выбран ни один менеджер для отображения в отчетах.`;
      }

      const activeManagers = [];
      const managerEmailsSet = new Set(activeEmails);
      const internalToManager = {};
      const emailToManager = {};

      for (const [email, emp] of Object.entries(employees)) {
        const normEmail = email.trim().toLowerCase();
        if (managerEmailsSet.has(normEmail)) {
          const mgr = {
            email: normEmail,
            name: emp.name || email,
            internalNumber: emp.endpointData ? emp.endpointData.internalNumber : null,
            stats: {
              totalCalls: 0,
              uniqueCalls: new Set(),
              totalMinutes: 0, // In seconds, converted to minutes later
              successCalls: 0,
              longCalls: 0
            }
          };
          activeManagers.push(mgr);
          emailToManager[normEmail] = mgr;
          if (mgr.internalNumber) {
            internalToManager[mgr.internalNumber] = mgr;
          }
        }
      }

      if (activeManagers.length === 0) {
        return `📞 ОТЧЕТ ПО ЗВОНКАМ МЕНЕДЖЕРОВ\n\nДата: ${dateToProcess}\n\n⚠️ Ни один из выбранных менеджеров не найден в списке сотрудников Binotel.`;
      }

      // Aggregate call details
      for (const call of Object.values(calls)) {
        let targetManager = null;

        // Try to match by email
        if (call.employeeData && call.employeeData.email) {
          const callEmail = call.employeeData.email.trim().toLowerCase();
          if (emailToManager[callEmail]) {
            targetManager = emailToManager[callEmail];
          }
        }

        // Fallback to internalNumber
        if (!targetManager && call.internalNumber) {
          if (internalToManager[call.internalNumber]) {
            targetManager = internalToManager[call.internalNumber];
          }
        }

        if (targetManager) {
          const stats = targetManager.stats;
          stats.totalCalls++;

          if (call.externalNumber) {
            stats.uniqueCalls.add(call.externalNumber);
          }

          const billsec = parseInt(call.billsec || 0, 10);
          stats.totalMinutes += billsec;

          const disposition = call.disposition ? call.disposition.toUpperCase() : '';
          if (disposition === 'ANSWER') {
            stats.successCalls++;
          }

          if (billsec > 60) {
            stats.longCalls++;
          }
        }
      }

      // Sort managers alphabetically by name
      activeManagers.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

      // Build Message
      let msg = `📞 ОТЧЕТ ПО ЗВОНКАМ МЕНЕДЖЕРОВ\n\n`;
      msg += `Дата: ${dateToProcess}\n`;
      msg += `━━━━━━━━━━━━━━\n\n`;

      for (const mgr of activeManagers) {
        const minutes = Math.round(mgr.stats.totalMinutes / 60);

        msg += `👤 **${mgr.name}** ${mgr.internalNumber ? `(вн. ${mgr.internalNumber})` : ''}\n`;
        msg += `• Всего звонков: ${mgr.stats.totalCalls}\n`;
        msg += `• Уникальных звонков: ${mgr.stats.uniqueCalls.size}\n`;
        msg += `• Минут на линии: ${minutes} мин\n`;
        msg += `• Успешных звонков: ${mgr.stats.successCalls}\n`;
        msg += `• Звонков > 1 мин: ${mgr.stats.longCalls}\n\n`;
      }

      msg += `━━━━━━━━━━━━━━\n`;
      msg += `Отчет сформирован автоматически`;

      return msg;
    } catch (err) {
      logger.error('Failed to generate call report:', err.message);
      return `⚠️ Ошибка формирования отчета по звонкам:\n${err.message}`;
    }
  }

  /**
   * Fetches statistics from amoCRM API and aggregates report for active managers.
   * @param {string} [targetDateStr] - Date formatted as "dd.MM.yyyy"
   * @returns {Promise<string>} Fully formatted Telegram message
   */
  async getAmoReportText(targetDateStr = null) {
    const dateToProcess = targetDateStr || formatter.formatDate(new Date());
    logger.info(`Generating amoCRM report for managers on date: ${dateToProcess}`);

    // Check credentials first
    if (!config.AMO_SUBDOMAIN || !config.AMO_INTEGRATION_TOKEN) {
      return `📊 ОТЧЕТ ПО РАБОТЕ В amoCRM\n\nДата: ${dateToProcess}\n\n⚠️ Учетные данные amoCRM не настроены в панели управления. Пожалуйста, укажите Субдомен и Токен доступа.`;
    }

    // Parse date parts and calculate local day range timestamps
    let startTime, stopTime;
    try {
      const [day, month, year] = dateToProcess.split('.').map(Number);
      
      const getTimestampForLocalTime = (y, m, d, h, min, sec, tz) => {
        let guess = Date.UTC(y, m - 1, d, h, min, sec);
        const effectiveTz = formatter.normalizeTimezone(tz || config.TIMEZONE);
        const formatterInstance = new Intl.DateTimeFormat('en-US', {
          timeZone: effectiveTz,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false
        });
        const parts = formatterInstance.formatToParts(new Date(guess));
        const partVal = (type) => parseInt(parts.find(p => p.type === type).value, 10);
        const fYear = partVal('year');
        const fMonth = partVal('month');
        const fDay = partVal('day');
        const fHour = partVal('hour') % 24;
        const fMin = partVal('minute');
        const fSec = partVal('second');
        const formattedUTC = Date.UTC(fYear, fMonth - 1, fDay, fHour, fMin, fSec);
        const diff = formattedUTC - guess;
        return Math.floor((guess - diff) / 1000);
      };

      startTime = getTimestampForLocalTime(year, month, day, 0, 0, 0, config.TIMEZONE);
      stopTime = getTimestampForLocalTime(year, month, day, 23, 59, 59, config.TIMEZONE);
    } catch (err) {
      logger.error('Failed to parse date range for amoCRM events:', err.message);
      return `⚠️ Не удалось разобрать дату ${dateToProcess} для формирования отчета amoCRM.`;
    }

    try {
      const amocrmService = require('./amocrm.service');
      logger.info(`Fetching amoCRM data for range: ${startTime} to ${stopTime}`);

      const [users, tasks, events] = await Promise.all([
        amocrmService.fetchUsers(),
        amocrmService.fetchTasks(),
        amocrmService.fetchEventsForPeriod(startTime, stopTime)
      ]);

      const activeUserIdsStr = config.AMO_ACTIVE_MANAGERS || '';
      const activeUserIds = activeUserIdsStr
        ? activeUserIdsStr.split(',').map(id => id.trim()).filter(id => id.length > 0)
        : [];

      if (activeUserIds.length === 0) {
        return `📊 ОТЧЕТ ПО РАБОТЕ В amoCRM\n\nДата: ${dateToProcess}\n\n⚠️ В веб-интерфейсе не выбран ни один менеджер для отображения в отчете.`;
      }

      const activeManagers = [];
      const managerIdsSet = new Set(activeUserIds);

      for (const u of users) {
        const uIdStr = String(u.id);
        if (managerIdsSet.has(uIdStr)) {
          activeManagers.push({
            id: u.id,
            name: u.name || u.email || uIdStr,
            email: u.email || '',
            stats: {
              actions: 0,
              tasksTotal: 0,
              tasksOverdue: 0,
              tasksToday: 0,
              tasksFuture: 0
            }
          });
        }
      }

      if (activeManagers.length === 0) {
        return `📊 ОТЧЕТ ПО РАБОТЕ В amoCRM\n\nДата: ${dateToProcess}\n\n⚠️ Ни один из выбранных менеджеров не найден в списке пользователей amoCRM.`;
      }

      const managerMap = {};
      for (const mgr of activeManagers) {
        managerMap[mgr.id] = mgr;
      }

      // Count events (actions)
      for (const ev of events) {
        const creatorId = ev.created_by;
        if (managerMap[creatorId]) {
          managerMap[creatorId].stats.actions++;
        }
      }

      // Count tasks status
      const now = Math.floor(Date.now() / 1000);
      const todayDateStr = formatter.formatDate(new Date(), config.TIMEZONE); // Format today's date as "dd.MM.yyyy" in Almaty timezone

      for (const t of tasks) {
        const respId = t.responsible_user_id;
        if (managerMap[respId]) {
          const stats = managerMap[respId].stats;
          const deadline = parseInt(t.complete_till || 0, 10);
          
          if (!t.is_completed) {
            stats.tasksTotal++;
            
            if (deadline === 0) {
              stats.tasksFuture++;
            } else {
              // Format task deadline in UTC (standardizing CIS offset differences for date matching)
              const taskDateStr = new Intl.DateTimeFormat('ru-RU', {
                timeZone: 'UTC',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              }).format(new Date(deadline * 1000));

              if (taskDateStr === todayDateStr) {
                stats.tasksToday++;
              } else if (deadline < now) {
                stats.tasksOverdue++;
              } else {
                stats.tasksFuture++;
              }
            }
          }
        }
      }

      // Sort managers alphabetically by name
      activeManagers.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

      // Build report text
      let msg = `📊 ОТЧЕТ ПО РАБОТЕ В amoCRM\n\n`;
      msg += `Дата: ${dateToProcess}\n`;
      msg += `━━━━━━━━━━━━━━\n\n`;

      for (const mgr of activeManagers) {
        msg += `👤 **${mgr.name}**\n`;
        msg += `• Действий сегодня: ${mgr.stats.actions}\n`;
        msg += `• Задачи:\n`;
        msg += `  - Просрочено: ${mgr.stats.tasksOverdue}\n`;
        msg += `  - На сегодня: ${mgr.stats.tasksToday}\n`;
        msg += `  - Будущие: ${mgr.stats.tasksFuture}\n`;
        msg += `  - Всего открытых: ${mgr.stats.tasksTotal}\n\n`;
      }

      msg += `━━━━━━━━━━━━━━\n`;
      msg += `Отчет сформирован автоматически`;

      return msg;
    } catch (err) {
      logger.error('Failed to generate amoCRM report:', err.message);
      return `⚠️ Ошибка формирования отчета amoCRM:\n${err.message}`;
    }
  }

  /**
   * Generates amoCRM report for a specific date and sends it to Telegram.
   * @param {string} [targetDateStr] - Format "dd.MM.yyyy"
   * @returns {Promise<{success: boolean, text: string, telegramResults?: any, error?: string}>}
   */
  async generateAndSendAmoReport(targetDateStr = null) {
    try {
      const dateToProcess = targetDateStr || formatter.formatDate(new Date());
      logger.info(`Running automated amoCRM report generation for date: ${dateToProcess}`);

      const reportText = await this.getAmoReportText(dateToProcess);
      
      logger.info('--- GENERATED amoCRM REPORT ---');
      console.log(reportText);
      logger.info('------------------------');

      const telegramResults = await telegramService.sendReport(reportText);

      return {
        success: true,
        text: reportText,
        telegramResults
      };
    } catch (error) {
      logger.error('Failed to generate or send amoCRM report:', error.message);
      return {
        success: false,
        error: error.message,
        text: `Ошибка генерации отчета amoCRM: ${error.message}`
      };
    }
  }
}

module.exports = new ReportService();
