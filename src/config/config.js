const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

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
};

// Load saved settings if they exist
function loadSettings() {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const saved = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
      if (saved.TIMEZONE) currentConfig.TIMEZONE = saved.TIMEZONE;
      if (saved.BOT_TOKEN) currentConfig.TELEGRAM.BOT_TOKEN = saved.BOT_TOKEN;
      if (saved.CHAT_ID) currentConfig.TELEGRAM.CHAT_IDS = parseChatIds(saved.CHAT_ID);
      if (saved.APPS_SCRIPT_URL) currentConfig.APPS_SCRIPT_URL = saved.APPS_SCRIPT_URL;
      if (saved.APPS_SCRIPT_URL_OP1) currentConfig.APPS_SCRIPT_URL_OP1 = saved.APPS_SCRIPT_URL_OP1;
      if (saved.DASHBOARD_PASSWORD) currentConfig.DASHBOARD_PASSWORD = saved.DASHBOARD_PASSWORD;
    }
  } catch (err) {
    console.error('Failed to load settings.json:', err.message);
  }
}

loadSettings();

module.exports = {
  get PORT() { return currentConfig.PORT; },
  get TIMEZONE() { return currentConfig.TIMEZONE; },
  get TELEGRAM() { return currentConfig.TELEGRAM; },
  
  get APPS_SCRIPT_URL() { return currentConfig.APPS_SCRIPT_URL; },
  set APPS_SCRIPT_URL(val) { currentConfig.APPS_SCRIPT_URL = val; },
  
  get APPS_SCRIPT_URL_OP1() { return currentConfig.APPS_SCRIPT_URL_OP1; },
  set APPS_SCRIPT_URL_OP1(val) { currentConfig.APPS_SCRIPT_URL_OP1 = val; },

  get DASHBOARD_PASSWORD() { return currentConfig.DASHBOARD_PASSWORD; },

  // Saves settings to settings.json and updates in-memory config instantly
  saveSettings(newSettings) {
    try {
      fs.writeFileSync(settingsFilePath, JSON.stringify(newSettings, null, 2), 'utf8');
      
      if (newSettings.TIMEZONE) currentConfig.TIMEZONE = newSettings.TIMEZONE;
      if (newSettings.BOT_TOKEN) currentConfig.TELEGRAM.BOT_TOKEN = newSettings.BOT_TOKEN;
      if (newSettings.CHAT_ID) currentConfig.TELEGRAM.CHAT_IDS = parseChatIds(newSettings.CHAT_ID);
      if (newSettings.APPS_SCRIPT_URL) currentConfig.APPS_SCRIPT_URL = newSettings.APPS_SCRIPT_URL;
      if (newSettings.APPS_SCRIPT_URL_OP1) currentConfig.APPS_SCRIPT_URL_OP1 = newSettings.APPS_SCRIPT_URL_OP1;
      if (newSettings.DASHBOARD_PASSWORD) currentConfig.DASHBOARD_PASSWORD = newSettings.DASHBOARD_PASSWORD;
      
      return true;
    } catch (err) {
      console.error('Failed to save settings.json:', err.message);
      return false;
    }
  },

  // Returns the current settings format optimized for form editing
  getRawSettings() {
    if (fs.existsSync(settingsFilePath)) {
      try {
        return JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
      } catch (e) {}
    }
    
    // Fallback to currently active config loaded from process.env
    return {
      BOT_TOKEN: currentConfig.TELEGRAM.BOT_TOKEN,
      CHAT_ID: process.env.CHAT_ID || '',
      APPS_SCRIPT_URL: currentConfig.APPS_SCRIPT_URL,
      APPS_SCRIPT_URL_OP1: currentConfig.APPS_SCRIPT_URL_OP1,
      TIMEZONE: currentConfig.TIMEZONE,
      DASHBOARD_PASSWORD: currentConfig.DASHBOARD_PASSWORD
    };
  }
};
