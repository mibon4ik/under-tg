const cron = require('node-cron');
const config = require('../config/config');
const reportService = require('./report.service');
const logger = require('../utils/logger');

const formatter = require('../utils/formatter');

/**
 * Service to manage background automated report generation using node-cron.
 */
class SchedulerService {
  constructor() {
    this.salesTask = null;
    this.amoTask = null;
  }

  /**
   * Initializes and starts the cron jobs.
   */
  start() {
    const timezone = formatter.normalizeTimezone(config.TIMEZONE);

    // 1. Schedule daily sales report
    const salesTime = config.SALES_REPORT_TIME || '21:00';
    const [salesHours, salesMinutes] = salesTime.split(':').map(Number);
    const salesCronExpression = `${isNaN(salesMinutes) ? 0 : salesMinutes} ${isNaN(salesHours) ? 21 : salesHours} * * *`;
    logger.info(`Initializing sales report scheduler. Cron expression: "${salesCronExpression}" in timezone "${timezone}".`);

    try {
      this.salesTask = cron.schedule(
        salesCronExpression,
        async () => {
          logger.info('Scheduled sales cron task triggered. Executing daily sales report...');
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

      logger.info('Sales cron job scheduler successfully started.');
    } catch (error) {
      logger.error(`Failed to start sales cron scheduler: ${error.message}`);
    }

    // 2. Schedule daily amoCRM report
    if (config.AMO_REPORT_ENABLED === 'true') {
      const amoTime = config.AMO_REPORT_TIME || '20:00';
      const [hours, minutes] = amoTime.split(':').map(Number);
      
      // Construct valid cron expression: 'minutes hours * * *'
      const amoCronExpression = `${isNaN(minutes) ? 0 : minutes} ${isNaN(hours) ? 20 : hours} * * *`;
      logger.info(`Initializing amoCRM report scheduler. Cron expression: "${amoCronExpression}" in timezone "${timezone}".`);

      try {
        this.amoTask = cron.schedule(
          amoCronExpression,
          async () => {
            logger.info('Scheduled amoCRM cron task triggered. Executing daily amoCRM report...');
            try {
              const result = await reportService.generateAndSendAmoReport();
              if (result.success) {
                logger.info('Scheduled daily amoCRM report generated and sent successfully.');
              } else {
                logger.error(`Scheduled daily amoCRM report finished with errors: ${result.error}`);
              }
            } catch (err) {
              logger.error(`Critical error inside amoCRM cron execution block: ${err.message}`);
            }
          },
          {
            scheduled: true,
            timezone: timezone
          }
        );

        logger.info('amoCRM cron job scheduler successfully started.');
      } catch (error) {
        logger.error(`Failed to start amoCRM cron scheduler: ${error.message}`);
      }
    } else {
      logger.info('amoCRM automated report scheduling is disabled.');
    }
  }

  /**
   * Stops active cron jobs.
   */
  stop() {
    if (this.salesTask) {
      this.salesTask.stop();
      this.salesTask = null;
      logger.info('Sales cron job scheduler stopped.');
    }
    if (this.amoTask) {
      this.amoTask.stop();
      this.amoTask = null;
      logger.info('amoCRM cron job scheduler stopped.');
    }
  }

  /**
   * Restarts the scheduler by stopping and re-starting.
   */
  restart() {
    logger.info('Restarting report scheduler with new settings...');
    this.stop();
    this.start();
  }
}

module.exports = new SchedulerService();
