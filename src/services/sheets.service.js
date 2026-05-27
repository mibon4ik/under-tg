const { google } = require('googleapis');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Maps date string "dd.MM.yyyy" to the list of target sheet names.
 * Dynamically switches month name based on the target date (e.g. "Май", "Июнь").
 * @param {string} dateStr - Target date string
 * @returns {string[]} Array of resolved sheet names
 */
function resolveSheetNamesForDate(dateStr) {
  if (!dateStr) return ['Общие продажи Май (Продления)', 'Общие продажи Май (Отмены)'];
  
  const parts = dateStr.split('.');
  const month = parts[1]; // e.g. "05"
  
  const months = {
    '01': 'Январь',
    '02': 'Февраль',
    '03': 'Март',
    '04': 'Апрель',
    '05': 'Май',
    '06': 'Июнь',
    '07': 'Июль',
    '08': 'Август',
    '09': 'Сентябрь',
    '10': 'Октябрь',
    '11': 'Ноябрь',
    '12': 'Декабрь'
  };
  
  const monthName = months[month] || 'Май';
  return [
    `Общие продажи ${monthName} (Продления)`,
    `Общие продажи ${monthName} (Отмены)`
  ];
}

/**
 * Service to connect and fetch data from Google Sheets.
 */
class SheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
  }

  /**
   * Initializes Google Authentication.
   * Uses JWT Service Account credentials.
   */
  initAuth() {
    if (this.auth && this.sheets) return;

    const email = config.GOOGLE.CLIENT_EMAIL;
    const privateKey = config.GOOGLE.PRIVATE_KEY;
    const sheetId = config.GOOGLE.SHEET_ID;

    if (!email || !privateKey || !sheetId) {
      logger.error('Missing Google credentials in configuration. Please check your .env file.');
      throw new Error('Google credentials not fully configured');
    }

    try {
      this.auth = new google.auth.JWT(
        email,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/spreadsheets.readonly']
      );
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      logger.info('Google Sheets API Authentication initialized successfully.');
    } catch (error) {
      logger.error('Failed to initialize Google Sheets Authentication:', error.message);
      throw error;
    }
  }

  /**
   * Fetches data from sheets dynamically resolved based on date (e.g. 'Общие продажи Май (Продления)').
   * Safe against missing sheets and individual sheet read failures.
   * @param {string} targetDateStr - Target date in format "dd.MM.yyyy"
   * @returns {Promise<Object>} An object mapping sheetName -> 2D array of raw row data.
   */
  async fetchSheetsData(targetDateStr) {
    this.initAuth();
    const data = {};
    const sheetNames = resolveSheetNamesForDate(targetDateStr);

    logger.info(`Starting to fetch data from spreadsheet ID: ${config.GOOGLE.SHEET_ID}`);

    for (const sheetName of sheetNames) {
      try {
        logger.info(`Fetching data from sheet: "${sheetName}"...`);
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: config.GOOGLE.SHEET_ID,
          range: `${sheetName}!A:K`,
        });

        const rows = response.data.values || [];
        data[sheetName] = rows;
        logger.info(`Successfully fetched ${rows.length} rows from sheet "${sheetName}".`);
      } catch (error) {
        logger.error(`Error fetching sheet "${sheetName}": ${error.message}`);
        // Keep it empty rather than failing the entire run
        data[sheetName] = [];
      }
    }

    return data;
  }
}

module.exports = new SheetsService();
