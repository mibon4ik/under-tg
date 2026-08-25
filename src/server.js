const app = require('./app');
const config = require('./config/config');
const schedulerService = require('./services/scheduler.service');
const telegramService = require('./services/telegram.service');
const logger = require('./utils/logger');

// Log instead of crashing on an unhandled rejection/exception — a crashed process
// means the bot stops responding entirely until Railway restarts it.
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${reason && reason.message ? reason.message : reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
});

async function startServer() {
  // 1. Wait for PostgreSQL settings initialization
  try {
    await config.initDb();
  } catch (err) {
    logger.error(`Failed to initialize database settings on startup: ${err.message}`);
  }

  const PORT = config.PORT;

  // 2. Start Express Server
  const server = app.listen(PORT, () => {
    logger.info(`Express Server successfully started on port ${PORT}.`);

    // Start Cron Scheduler Job
    try {
      schedulerService.start();
      logger.info('Daily sales report scheduler is active.');
    } catch (error) {
      logger.error(`Critical error starting daily report scheduler: ${error.message}`);
    }

    // Start Background Telegram Update Listener (Long Polling if configured)
    if (config.TELEGRAM.MODE === 'polling') {
      try {
        telegramService.startPolling();
        logger.info('Interactive Telegram Bot update listener is active (polling mode).');
      } catch (error) {
        logger.error(`Critical error starting Telegram Bot update listener: ${error.message}`);
      }
    } else {
      logger.info('Interactive Telegram Bot update listener is active (webhook mode).');
    }
  });

  // Handle graceful shutdown signals
  const shutdown = (signal) => {
    logger.warn(`Received ${signal}. Shutting down application gracefully...`);
    schedulerService.stop();
    server.close(() => {
      logger.info('HTTP server closed. Process exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
