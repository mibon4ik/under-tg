const cron = require('node-cron');
const config = require('../config/config');
const reportService = require('./report.service');
const logger = require('../utils/logger');

/**
 * Service to manage background automated report generation using node-cron.
 */
class SchedulerService {
  constructor() {
    this.task = null;
  }

  /**
   * Initializes and starts the cron job.
   */
  start() {
    const cronExpression = '0 21 * * *'; // Every day at 21:00 (9:00 PM)
    const timezone = config.TIMEZONE;

    logger.info(`Initializing scheduler. Cron expression: "${cronExpression}" in timezone "${timezone}".`);

    try {
      this.task = cron.schedule(
        cronExpression,
        async () => {
          logger.info('Scheduled cron task triggered. Executing daily sales report...');
          try {
            const result = await reportService.generateAndSendReport();
            if (result.success) {
              logger.info('Scheduled daily report generated and sent successfully.');
            } else {
              logger.error(`Scheduled daily report finished with errors: ${result.error}`);
            }
          } catch (err) {
            logger.error(`Critical error inside cron execution block: ${err.message}`);
          }
        },
        {
          scheduled: true,
          timezone: timezone
        }
      );

      logger.info('Cron job scheduler successfully started.');
    } catch (error) {
      logger.error(`Failed to start cron scheduler: ${error.message}`);
    }
  }

  /**
   * Stops the active cron job.
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Cron job scheduler stopped.');
    }
  }
}

module.exports = new SchedulerService();
