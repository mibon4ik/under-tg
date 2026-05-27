const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

// Helper to format Google Private Key correctly
function formatPrivateKey(key) {
  if (!key) return '';
  // Replace literal '\n' sequences with actual newlines
  return key.replace(/\\n/g, '\n').replace(/"/g, '').trim();
}

// Helper to parse multiple Chat IDs
function parseChatIds(chatIdStr) {
  if (!chatIdStr) return [];
  return chatIdStr
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

module.exports = {
  PORT: process.env.PORT || 3000,
  TIMEZONE: process.env.TIMEZONE || 'Asia/Almaty',
  TELEGRAM: {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    CHAT_IDS: parseChatIds(process.env.CHAT_ID || ''),
  },
  GOOGLE: {
    SHEET_ID: process.env.GOOGLE_SHEET_ID || '',
    CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL || '',
    PRIVATE_KEY: formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY || ''),
  },
};
