const app = require('./app');
const config = require('./config/config');
const schedulerService = require('./services/scheduler.service');
const logger = require('./utils/logger');

// Retrieve Port Configuration
const PORT = config.PORT;

// Start Express Server
const server = app.listen(PORT, () => {
  logger.info(`Express Server successfully started on port ${PORT}.`);

  // Start Cron Scheduler Job
  try {
    schedulerService.start();
    logger.info('Daily sales report scheduler is active.');
  } catch (error) {
    logger.error(`Critical error starting daily report scheduler: ${error.message}`);
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
