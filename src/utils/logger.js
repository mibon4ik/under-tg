/**
 * Logger utility providing formatted console logs with timestamps.
 */
function getTimestamp() {
  const tz = process.env.TIMEZONE || 'Asia/Almaty';
  try {
    return new Date().toLocaleString('ru-RU', { timeZone: tz });
  } catch (error) {
    return new Date().toISOString();
  }
}

const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] [${getTimestamp()}] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] [${getTimestamp()}] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.log(`[WARN] [${getTimestamp()}] ${message}`, ...args);
  }
};

module.exports = logger;
