/**
 * Logger utility providing formatted console logs with timestamps.
 */
function getTimestamp() {
  let tz = process.env.TIMEZONE || 'Asia/Almaty';
  if (/astana|kazakhstan|казахстан|астана|utc\+5|gmt\+5/i.test(tz)) {
    tz = 'Asia/Almaty';
  }
  try {
    return new Date().toLocaleString('ru-RU', { timeZone: tz });
  } catch (error) {
    try {
      return new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });
    } catch (e) {
      return new Date().toISOString();
    }
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
