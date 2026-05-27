const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

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
  APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL || '',
};
