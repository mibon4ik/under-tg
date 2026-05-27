const express = require('express');
const reportService = require('./services/report.service');
const logger = require('./utils/logger');
const telegramService = require('./services/telegram.service');

const app = express();

// Parse JSON requests
app.use(express.json());

/**
 * Root endpoint returning simple confirmation text
 * GET /
 */
app.get('/', (req, res) => {
  res.send('Bot is running');
});

/**
 * Health check endpoint for Railway and monitoring services
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Manual trigger endpoint for report sending
 * POST /send-report
 * Accepts optional JSON body: { "date": "26.05.2026" }
 */
app.post('/send-report', async (req, res) => {
  logger.info('Manual report trigger endpoint received a request.');
  
  const targetDate = req.body && req.body.date ? String(req.body.date).trim() : null;

  try {
    const result = await reportService.generateAndSendReport(targetDate);
    
    if (result.success) {
      return res.json({
        success: true,
        message: `Sales report generated successfully for date: ${targetDate || 'today'}.`,
        telegram: result.telegramResults,
        reportPreview: result.text
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to process report.'
      });
    }
  } catch (err) {
    logger.error('Error occurred in /send-report endpoint handler:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Telegram Webhook endpoint for forwarded updates from NestJS
 * POST /telegram/webhook
 */
app.post('/telegram/webhook', async (req, res) => {
  try {
    const update = req.body;
    if (update) {
      await telegramService.handleUpdate(update);
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('Error handling forwarded Telegram update:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled internal express error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
});

module.exports = app;
