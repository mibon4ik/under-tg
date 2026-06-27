const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load environment variables from .env file
dotenv.config();

const settingsFilePath = path.join(__dirname, 'settings.json');

// Helper to parse multiple Chat IDs
function parseChatIds(chatIdStr) {
  if (!chatIdStr) return [];
  return chatIdStr
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

// In-memory configuration defaults
let currentConfig = {
  PORT: process.env.PORT || 3000,
  TIMEZONE: process.env.TIMEZONE || 'Asia/Almaty',
  TELEGRAM: {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    CHAT_IDS: parseChatIds(process.env.CHAT_ID || ''),
    MODE: process.env.TELEGRAM_MODE || 'webhook',
  },
  APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL || '',
  APPS_SCRIPT_URL_OP1: process.env.APPS_SCRIPT_URL_OP1 || '',
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || 'admin',
  SHEET_PROD: '',
  SHEET_OTMEN: '',
  SHEET_OP1: '',
  SHEET_RNP: '',
  
  // Binotel REST API settings
  BINOTEL_API_KEY: process.env.BINOTEL_API_KEY || '',
  BINOTEL_API_SECRET: process.env.BINOTEL_API_SECRET || '',
  BINOTEL_COMPANY_ID: process.env.BINOTEL_COMPANY_ID || '',
  BINOTEL_ACTIVE_MANAGERS: process.env.BINOTEL_ACTIVE_MANAGERS || '',

  // amoCRM settings
  AMO_SUBDOMAIN: process.env.AMO_SUBDOMAIN || '',
  AMO_INTEGRATION_TOKEN: process.env.AMO_INTEGRATION_TOKEN || '',
  AMO_ACTIVE_MANAGERS: process.env.AMO_ACTIVE_MANAGERS || '',
  AMO_REPORT_TIME: process.env.AMO_REPORT_TIME || '20:00',
  AMO_REPORT_ENABLED: process.env.AMO_REPORT_ENABLED || 'true',
  SALES_REPORT_TIME: process.env.SALES_REPORT_TIME || '21:00',
};

// PostgreSQL Connection Pool Setup
let dbPool = null;
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  console.log('[DB] Connecting to Railway PostgreSQL Database...');
  dbPool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false } // Required for Railway internal/external pg connections
  });
} else {
  console.log('[DB] DATABASE_URL not set. Falling back to local settings.json storage.');
}

// Setup DB Schema & Load Settings dynamically on startup
async function initDb() {
  if (dbPool) {
    try {
      // 1. Create settings table if not exists
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT
        )
      `);
      console.log('[DB] Settings table initialized successfully.');

      // Initialize authentication database tables and defaults
      const authService = require('../services/auth.service');
      await authService.initAuthDb(dbPool, currentConfig.DASHBOARD_PASSWORD || 'admin');

      // 2. Load all settings from DB
      const res = await dbPool.query('SELECT * FROM settings');
      const dbSettings = {};
      res.rows.forEach(row => {
        dbSettings[row.key] = row.value;
      });

      console.log('[DB] Loaded settings from database.');

      // 3. Map database settings to in-memory config
      if (dbSettings.TIMEZONE) currentConfig.TIMEZONE = dbSettings.TIMEZONE;
      if (dbSettings.BOT_TOKEN) currentConfig.TELEGRAM.BOT_TOKEN = dbSettings.BOT_TOKEN;
      if (dbSettings.CHAT_ID) currentConfig.TELEGRAM.CHAT_IDS = parseChatIds(dbSettings.CHAT_ID);
      if (dbSettings.APPS_SCRIPT_URL) currentConfig.APPS_SCRIPT_URL = dbSettings.APPS_SCRIPT_URL;
      if (dbSettings.APPS_SCRIPT_URL_OP1) currentConfig.APPS_SCRIPT_URL_OP1 = dbSettings.APPS_SCRIPT_URL_OP1;
      if (dbSettings.DASHBOARD_PASSWORD) currentConfig.DASHBOARD_PASSWORD = dbSettings.DASHBOARD_PASSWORD;
      if (dbSettings.SHEET_PROD) currentConfig.SHEET_PROD = dbSettings.SHEET_PROD;
      if (dbSettings.SHEET_OTMEN) currentConfig.SHEET_OTMEN = dbSettings.SHEET_OTMEN;
      if (dbSettings.SHEET_OP1) currentConfig.SHEET_OP1 = dbSettings.SHEET_OP1;
      if (dbSettings.SHEET_RNP) currentConfig.SHEET_RNP = dbSettings.SHEET_RNP;
      
      // Load Binotel Settings
      if (dbSettings.BINOTEL_API_KEY) currentConfig.BINOTEL_API_KEY = dbSettings.BINOTEL_API_KEY;
      if (dbSettings.BINOTEL_API_SECRET) currentConfig.BINOTEL_API_SECRET = dbSettings.BINOTEL_API_SECRET;
      if (dbSettings.BINOTEL_COMPANY_ID) currentConfig.BINOTEL_COMPANY_ID = dbSettings.BINOTEL_COMPANY_ID;
      if (dbSettings.BINOTEL_ACTIVE_MANAGERS) currentConfig.BINOTEL_ACTIVE_MANAGERS = dbSettings.BINOTEL_ACTIVE_MANAGERS;

      // Load amoCRM Settings
      if (dbSettings.AMO_SUBDOMAIN) currentConfig.AMO_SUBDOMAIN = dbSettings.AMO_SUBDOMAIN;
      if (dbSettings.AMO_INTEGRATION_TOKEN) currentConfig.AMO_INTEGRATION_TOKEN = dbSettings.AMO_INTEGRATION_TOKEN;
      if (dbSettings.AMO_ACTIVE_MANAGERS) currentConfig.AMO_ACTIVE_MANAGERS = dbSettings.AMO_ACTIVE_MANAGERS;
      if (dbSettings.AMO_REPORT_TIME) currentConfig.AMO_REPORT_TIME = dbSettings.AMO_REPORT_TIME;
      if (dbSettings.AMO_REPORT_ENABLED) currentConfig.AMO_REPORT_ENABLED = dbSettings.AMO_REPORT_ENABLED;
      if (dbSettings.SALES_REPORT_TIME) currentConfig.SALES_REPORT_TIME = dbSettings.SALES_REPORT_TIME;

    } catch (err) {
      console.error('[DB] Failed to initialize PostgreSQL settings:', err.message);
      loadLocalSettings();
      const authService = require('../services/auth.service');
      authService.initAuthDb(null, currentConfig.DASHBOARD_PASSWORD || 'admin');
    }
  } else {
    loadLocalSettings();
    const authService = require('../services/auth.service');
    authService.initAuthDb(null, currentConfig.DASHBOARD_PASSWORD || 'admin');
  }
}

function loadLocalSettings() {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const saved = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
      if (saved.TIMEZONE) currentConfig.TIMEZONE = saved.TIMEZONE;
      if (saved.BOT_TOKEN) currentConfig.TELEGRAM.BOT_TOKEN = saved.BOT_TOKEN;
      if (saved.CHAT_ID) currentConfig.TELEGRAM.CHAT_IDS = parseChatIds(saved.CHAT_ID);
      if (saved.APPS_SCRIPT_URL) currentConfig.APPS_SCRIPT_URL = saved.APPS_SCRIPT_URL;
      if (saved.APPS_SCRIPT_URL_OP1) currentConfig.APPS_SCRIPT_URL_OP1 = saved.APPS_SCRIPT_URL_OP1;
      if (saved.DASHBOARD_PASSWORD) currentConfig.DASHBOARD_PASSWORD = saved.DASHBOARD_PASSWORD;
      if (saved.SHEET_PROD) currentConfig.SHEET_PROD = saved.SHEET_PROD;
      if (saved.SHEET_OTMEN) currentConfig.SHEET_OTMEN = saved.SHEET_OTMEN;
      if (saved.SHEET_OP1) currentConfig.SHEET_OP1 = saved.SHEET_OP1;
      if (saved.SHEET_RNP) currentConfig.SHEET_RNP = saved.SHEET_RNP;
      
      // Load Binotel Local Settings
      if (saved.BINOTEL_API_KEY) currentConfig.BINOTEL_API_KEY = saved.BINOTEL_API_KEY;
      if (saved.BINOTEL_API_SECRET) currentConfig.BINOTEL_API_SECRET = saved.BINOTEL_API_SECRET;
      if (saved.BINOTEL_COMPANY_ID) currentConfig.BINOTEL_COMPANY_ID = saved.BINOTEL_COMPANY_ID;
      if (saved.BINOTEL_ACTIVE_MANAGERS) currentConfig.BINOTEL_ACTIVE_MANAGERS = saved.BINOTEL_ACTIVE_MANAGERS;

      // Load amoCRM Local Settings
      if (saved.AMO_SUBDOMAIN) currentConfig.AMO_SUBDOMAIN = saved.AMO_SUBDOMAIN;
      if (saved.AMO_INTEGRATION_TOKEN) currentConfig.AMO_INTEGRATION_TOKEN = saved.AMO_INTEGRATION_TOKEN;
      if (saved.AMO_ACTIVE_MANAGERS) currentConfig.AMO_ACTIVE_MANAGERS = saved.AMO_ACTIVE_MANAGERS;
      if (saved.AMO_REPORT_TIME) currentConfig.AMO_REPORT_TIME = saved.AMO_REPORT_TIME;
      if (saved.AMO_REPORT_ENABLED) currentConfig.AMO_REPORT_ENABLED = saved.AMO_REPORT_ENABLED;
      if (saved.SALES_REPORT_TIME) currentConfig.SALES_REPORT_TIME = saved.SALES_REPORT_TIME;
      console.log('[Local] Loaded settings from settings.json.');
    }
  } catch (err) {
    console.error('[Local] Failed to load settings.json:', err.message);
  }
}

// Trigger initialization immediately
initDb();

module.exports = {
  get dbPool() { return dbPool; },
  get PORT() { return currentConfig.PORT; },
  get TIMEZONE() { return currentConfig.TIMEZONE; },
  get TELEGRAM() { return currentConfig.TELEGRAM; },
  
  get APPS_SCRIPT_URL() { return currentConfig.APPS_SCRIPT_URL; },
  set APPS_SCRIPT_URL(val) { currentConfig.APPS_SCRIPT_URL = val; },
  
  get APPS_SCRIPT_URL_OP1() { return currentConfig.APPS_SCRIPT_URL_OP1; },
  set APPS_SCRIPT_URL_OP1(val) { currentConfig.APPS_SCRIPT_URL_OP1 = val; },

  get DASHBOARD_PASSWORD() { return currentConfig.DASHBOARD_PASSWORD; },
  
  get SHEET_PROD() { return currentConfig.SHEET_PROD; },
  get SHEET_OTMEN() { return currentConfig.SHEET_OTMEN; },
  get SHEET_OP1() { return currentConfig.SHEET_OP1; },
  get SHEET_RNP() { return currentConfig.SHEET_RNP; },

  get BINOTEL_API_KEY() { return currentConfig.BINOTEL_API_KEY; },
  get BINOTEL_API_SECRET() { return currentConfig.BINOTEL_API_SECRET; },
  get BINOTEL_COMPANY_ID() { return currentConfig.BINOTEL_COMPANY_ID; },
  get BINOTEL_ACTIVE_MANAGERS() { return currentConfig.BINOTEL_ACTIVE_MANAGERS; },

  // amoCRM getters
  get AMO_SUBDOMAIN() { return currentConfig.AMO_SUBDOMAIN; },
  get AMO_INTEGRATION_TOKEN() { return currentConfig.AMO_INTEGRATION_TOKEN; },
  get AMO_ACTIVE_MANAGERS() { return currentConfig.AMO_ACTIVE_MANAGERS; },
  get AMO_REPORT_TIME() { return currentConfig.AMO_REPORT_TIME; },
  get AMO_REPORT_ENABLED() { return currentConfig.AMO_REPORT_ENABLED; },
  get SALES_REPORT_TIME() { return currentConfig.SALES_REPORT_TIME; },

  // Saves settings dynamically to PostgreSQL and local fallback settings.json
  async saveSettings(newSettings) {
    try {
      // 1. Update local config in memory
      if (newSettings.TIMEZONE) currentConfig.TIMEZONE = newSettings.TIMEZONE;
      if (newSettings.BOT_TOKEN) currentConfig.TELEGRAM.BOT_TOKEN = newSettings.BOT_TOKEN;
      if (newSettings.CHAT_ID) currentConfig.TELEGRAM.CHAT_IDS = parseChatIds(newSettings.CHAT_ID);
      if (newSettings.APPS_SCRIPT_URL) currentConfig.APPS_SCRIPT_URL = newSettings.APPS_SCRIPT_URL;
      if (newSettings.APPS_SCRIPT_URL_OP1) currentConfig.APPS_SCRIPT_URL_OP1 = newSettings.APPS_SCRIPT_URL_OP1;
      if (newSettings.DASHBOARD_PASSWORD) currentConfig.DASHBOARD_PASSWORD = newSettings.DASHBOARD_PASSWORD;
      if (newSettings.SHEET_PROD !== undefined) currentConfig.SHEET_PROD = newSettings.SHEET_PROD;
      if (newSettings.SHEET_OTMEN !== undefined) currentConfig.SHEET_OTMEN = newSettings.SHEET_OTMEN;
      if (newSettings.SHEET_OP1 !== undefined) currentConfig.SHEET_OP1 = newSettings.SHEET_OP1;
      if (newSettings.SHEET_RNP !== undefined) currentConfig.SHEET_RNP = newSettings.SHEET_RNP;
      
      // Update Binotel Settings in memory
      if (newSettings.BINOTEL_API_KEY !== undefined) currentConfig.BINOTEL_API_KEY = newSettings.BINOTEL_API_KEY;
      if (newSettings.BINOTEL_API_SECRET !== undefined) currentConfig.BINOTEL_API_SECRET = newSettings.BINOTEL_API_SECRET;
      if (newSettings.BINOTEL_COMPANY_ID !== undefined) currentConfig.BINOTEL_COMPANY_ID = newSettings.BINOTEL_COMPANY_ID;
      if (newSettings.BINOTEL_ACTIVE_MANAGERS !== undefined) currentConfig.BINOTEL_ACTIVE_MANAGERS = newSettings.BINOTEL_ACTIVE_MANAGERS;

      // Update amoCRM Settings in memory
      if (newSettings.AMO_SUBDOMAIN !== undefined) currentConfig.AMO_SUBDOMAIN = newSettings.AMO_SUBDOMAIN;
      if (newSettings.AMO_INTEGRATION_TOKEN !== undefined) currentConfig.AMO_INTEGRATION_TOKEN = newSettings.AMO_INTEGRATION_TOKEN;
      if (newSettings.AMO_ACTIVE_MANAGERS !== undefined) currentConfig.AMO_ACTIVE_MANAGERS = newSettings.AMO_ACTIVE_MANAGERS;
      if (newSettings.AMO_REPORT_TIME !== undefined) currentConfig.AMO_REPORT_TIME = newSettings.AMO_REPORT_TIME;
      if (newSettings.AMO_REPORT_ENABLED !== undefined) currentConfig.AMO_REPORT_ENABLED = newSettings.AMO_REPORT_ENABLED;
      if (newSettings.SALES_REPORT_TIME !== undefined) currentConfig.SALES_REPORT_TIME = newSettings.SALES_REPORT_TIME;

      // 2. Persist to PostgreSQL if connection is active
      if (dbPool) {
        console.log('[DB] Saving settings to PostgreSQL database...');
        const keys = [
          'TIMEZONE', 'BOT_TOKEN', 'CHAT_ID', 
          'APPS_SCRIPT_URL', 'APPS_SCRIPT_URL_OP1', 'DASHBOARD_PASSWORD',
          'SHEET_PROD', 'SHEET_OTMEN', 'SHEET_OP1', 'SHEET_RNP',
          'BINOTEL_API_KEY', 'BINOTEL_API_SECRET', 'BINOTEL_COMPANY_ID', 'BINOTEL_ACTIVE_MANAGERS',
          'AMO_SUBDOMAIN', 'AMO_INTEGRATION_TOKEN', 'AMO_ACTIVE_MANAGERS', 'AMO_REPORT_TIME', 'AMO_REPORT_ENABLED',
          'SALES_REPORT_TIME'
        ];
        
        for (const k of keys) {
          let val = '';
          if (k === 'CHAT_ID') val = newSettings.CHAT_ID || '';
          else if (k === 'BOT_TOKEN') val = newSettings.BOT_TOKEN || '';
          else if (k === 'BINOTEL_API_KEY') val = newSettings.BINOTEL_API_KEY !== undefined ? newSettings.BINOTEL_API_KEY : currentConfig.BINOTEL_API_KEY;
          else if (k === 'BINOTEL_API_SECRET') val = newSettings.BINOTEL_API_SECRET !== undefined ? newSettings.BINOTEL_API_SECRET : currentConfig.BINOTEL_API_SECRET;
          else if (k === 'BINOTEL_COMPANY_ID') val = newSettings.BINOTEL_COMPANY_ID !== undefined ? newSettings.BINOTEL_COMPANY_ID : currentConfig.BINOTEL_COMPANY_ID;
          else if (k === 'BINOTEL_ACTIVE_MANAGERS') val = newSettings.BINOTEL_ACTIVE_MANAGERS !== undefined ? newSettings.BINOTEL_ACTIVE_MANAGERS : currentConfig.BINOTEL_ACTIVE_MANAGERS;
          else if (k === 'AMO_SUBDOMAIN') val = newSettings.AMO_SUBDOMAIN !== undefined ? newSettings.AMO_SUBDOMAIN : currentConfig.AMO_SUBDOMAIN;
          else if (k === 'AMO_INTEGRATION_TOKEN') val = newSettings.AMO_INTEGRATION_TOKEN !== undefined ? newSettings.AMO_INTEGRATION_TOKEN : currentConfig.AMO_INTEGRATION_TOKEN;
          else if (k === 'AMO_ACTIVE_MANAGERS') val = newSettings.AMO_ACTIVE_MANAGERS !== undefined ? newSettings.AMO_ACTIVE_MANAGERS : currentConfig.AMO_ACTIVE_MANAGERS;
          else if (k === 'AMO_REPORT_TIME') val = newSettings.AMO_REPORT_TIME !== undefined ? newSettings.AMO_REPORT_TIME : currentConfig.AMO_REPORT_TIME;
          else if (k === 'AMO_REPORT_ENABLED') val = newSettings.AMO_REPORT_ENABLED !== undefined ? newSettings.AMO_REPORT_ENABLED : currentConfig.AMO_REPORT_ENABLED;
          else if (k === 'SALES_REPORT_TIME') val = newSettings.SALES_REPORT_TIME !== undefined ? newSettings.SALES_REPORT_TIME : currentConfig.SALES_REPORT_TIME;
          else val = newSettings[k] !== undefined ? newSettings[k] : currentConfig[k] || '';
          
          await dbPool.query(`
            INSERT INTO settings (key, value) 
            VALUES ($1, $2) 
            ON CONFLICT (key) 
            DO UPDATE SET value = $2
          `, [k, String(val)]);
        }
        console.log('[DB] Settings successfully saved to PostgreSQL database.');
      }

      // 3. Keep local backup in settings.json
      const settingsToBackup = {
        TIMEZONE: currentConfig.TIMEZONE,
        BOT_TOKEN: currentConfig.TELEGRAM.BOT_TOKEN,
        CHAT_ID: currentConfig.TELEGRAM.CHAT_IDS.join(','),
        APPS_SCRIPT_URL: currentConfig.APPS_SCRIPT_URL,
        APPS_SCRIPT_URL_OP1: currentConfig.APPS_SCRIPT_URL_OP1,
        DASHBOARD_PASSWORD: currentConfig.DASHBOARD_PASSWORD,
        SHEET_PROD: currentConfig.SHEET_PROD,
        SHEET_OTMEN: currentConfig.SHEET_OTMEN,
        SHEET_OP1: currentConfig.SHEET_OP1,
        SHEET_RNP: currentConfig.SHEET_RNP,
        BINOTEL_API_KEY: currentConfig.BINOTEL_API_KEY,
        BINOTEL_API_SECRET: currentConfig.BINOTEL_API_SECRET,
        BINOTEL_COMPANY_ID: currentConfig.BINOTEL_COMPANY_ID,
        BINOTEL_ACTIVE_MANAGERS: currentConfig.BINOTEL_ACTIVE_MANAGERS,
        AMO_SUBDOMAIN: currentConfig.AMO_SUBDOMAIN,
        AMO_INTEGRATION_TOKEN: currentConfig.AMO_INTEGRATION_TOKEN,
        AMO_ACTIVE_MANAGERS: currentConfig.AMO_ACTIVE_MANAGERS,
        AMO_REPORT_TIME: currentConfig.AMO_REPORT_TIME,
        AMO_REPORT_ENABLED: currentConfig.AMO_REPORT_ENABLED,
        SALES_REPORT_TIME: currentConfig.SALES_REPORT_TIME
      };
      
      fs.writeFileSync(settingsFilePath, JSON.stringify(settingsToBackup, null, 2), 'utf8');
      
      return true;
    } catch (err) {
      console.error('[DB] Failed to save settings:', err.message);
      return false;
    }
  },

  // Returns the current settings format optimized for form editing
  getRawSettings() {
    return {
      BOT_TOKEN: currentConfig.TELEGRAM.BOT_TOKEN,
      CHAT_ID: currentConfig.TELEGRAM.CHAT_IDS.join(','),
      APPS_SCRIPT_URL: currentConfig.APPS_SCRIPT_URL,
      APPS_SCRIPT_URL_OP1: currentConfig.APPS_SCRIPT_URL_OP1,
      TIMEZONE: currentConfig.TIMEZONE,
      DASHBOARD_PASSWORD: currentConfig.DASHBOARD_PASSWORD,
      SHEET_PROD: currentConfig.SHEET_PROD,
      SHEET_OTMEN: currentConfig.SHEET_OTMEN,
      SHEET_OP1: currentConfig.SHEET_OP1,
      SHEET_RNP: currentConfig.SHEET_RNP,
      BINOTEL_API_KEY: currentConfig.BINOTEL_API_KEY,
      BINOTEL_API_SECRET: currentConfig.BINOTEL_API_SECRET,
      BINOTEL_COMPANY_ID: currentConfig.BINOTEL_COMPANY_ID,
      BINOTEL_ACTIVE_MANAGERS: currentConfig.BINOTEL_ACTIVE_MANAGERS,
      AMO_SUBDOMAIN: currentConfig.AMO_SUBDOMAIN,
      AMO_INTEGRATION_TOKEN: currentConfig.AMO_INTEGRATION_TOKEN,
      AMO_ACTIVE_MANAGERS: currentConfig.AMO_ACTIVE_MANAGERS,
      AMO_REPORT_TIME: currentConfig.AMO_REPORT_TIME,
      AMO_REPORT_ENABLED: currentConfig.AMO_REPORT_ENABLED,
      SALES_REPORT_TIME: currentConfig.SALES_REPORT_TIME
    };
  },
  
  initDb
};
