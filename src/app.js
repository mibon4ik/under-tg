const express = require('express');
const axios = require('axios');
const path = require('path');
const reportService = require('./services/report.service');
const logger = require('./utils/logger');
const telegramService = require('./services/telegram.service');
const config = require('./config/config');
const authService = require('./services/auth.service');

const app = express();

// Parse JSON requests
app.use(express.json());

// Enable CORS for Vercel deployment support
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Root endpoint returning index.html configuration dashboard
 * GET /
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * Health check endpoint for Railway and monitoring services
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Secure Password Authorization Middleware for all API routes
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  
  try {
    const session = await authService.validateSession(authHeader);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired session' });
    }
    
    req.user = session; // Append user session (username) to req
    next();
  } catch (err) {
    logger.error('Error verifying auth session:', err.message);
    res.status(500).json({ success: false, error: 'Internal auth verification error' });
  }
};

/**
 * Validate username and password for UI login, generating a secure session token
 * POST /api/login
 */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const targetUsername = username || 'admin';
  
  if (!password) {
    return res.status(400).json({ success: false, error: 'Пароль обязателен' });
  }
  
  try {
    const isValid = await authService.authenticateUser(targetUsername, password);
    if (isValid) {
      const token = await authService.createSession(targetUsername);
      res.json({ success: true, token, username: targetUsername });
    } else {
      res.status(401).json({ success: false, error: 'Неверные логин или пароль' });
    }
  } catch (err) {
    logger.error('Error during login:', err.message);
    res.status(500).json({ success: false, error: 'Internal login processing error' });
  }
});

/**
 * Get active raw configuration settings
 * GET /api/settings
 */
app.get('/api/settings', authMiddleware, (req, res) => {
  res.json({
    success: true,
    settings: config.getRawSettings()
  });
});

/**
 * Save new configuration settings live to settings.json
 * POST /api/settings
 */
app.post('/api/settings', authMiddleware, async (req, res) => {
  const newSettings = req.body;
  if (!newSettings) {
    return res.status(400).json({ success: false, error: 'Empty settings payload' });
  }

  try {
    // If password is updated in system parameters, save and hash in postgres users table
    if (newSettings.DASHBOARD_PASSWORD) {
      const username = req.user ? req.user.username : 'admin';
      await authService.updateUserPassword(username, newSettings.DASHBOARD_PASSWORD);
    }

    const success = await config.saveSettings(newSettings);
    if (success) {
      logger.info('System settings successfully updated dynamically via web dashboard.');
      res.json({ success: true, message: 'Settings saved successfully.' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to write settings file to disk.' });
    }
  } catch (err) {
    logger.error('Error updating settings:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error while saving settings.' });
  }
});

/**
 * Test Telegram Bot connection live (sends test message)
 * POST /api/test-telegram
 */
app.post('/api/test-telegram', authMiddleware, async (req, res) => {
  const { BOT_TOKEN, CHAT_ID } = req.body;
  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(400).json({ success: false, error: 'BOT_TOKEN and CHAT_ID are required' });
  }

  const chatIds = CHAT_ID.split(',').map(id => id.trim()).filter(id => id.length > 0);
  const results = { success: [], failed: [] };

  for (const chatId of chatIds) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      await axios.post(url, {
        chat_id: chatId,
        text: `🔔 **ТЕСТ ПОДКЛЮЧЕНИЯ**\n\nПоздравляем! Ваш Telegram бот успешно настроен и подключен к системе отчетов продаж. Ура! 🎉`
      });
      results.success.push(chatId);
    } catch (err) {
      results.failed.push({ chatId, error: err.message });
    }
  }

  res.json({
    success: results.failed.length === 0,
    results
  });
});

/**
 * Test Google Sheets connection URLs live
 * POST /api/test-sheets
 */
app.post('/api/test-sheets', authMiddleware, async (req, res) => {
  const { APPS_SCRIPT_URL, APPS_SCRIPT_URL_OP1 } = req.body;
  const results = {
    sheets: { ok: false, error: null, date: null, sheetsList: [] },
    sheets_op1: { ok: false, error: null, date: null, sheetsList: [] }
  };

  const todayStr = require('./utils/formatter').formatDate(new Date());

  // Test Sheets 1
  if (APPS_SCRIPT_URL) {
    try {
      const response = await axios.get(APPS_SCRIPT_URL, {
        params: { date: todayStr },
        timeout: 10000
      });
      if (response.data && response.data.ok) {
        results.sheets.ok = true;
        results.sheets.date = response.data.date;
        results.sheets.sheetsList = Object.keys(response.data.data || {});
      } else {
        results.sheets.error = response.data ? response.data.error : 'unknown error';
      }
    } catch (err) {
      results.sheets.error = err.message;
    }
  } else {
    results.sheets.error = 'URL not configured';
  }

  // Test Sheets OP1
  if (APPS_SCRIPT_URL_OP1) {
    try {
      const response = await axios.get(APPS_SCRIPT_URL_OP1, {
        params: { date: todayStr },
        timeout: 10000
      });
      if (response.data && response.data.ok) {
        results.sheets_op1.ok = true;
        results.sheets_op1.date = response.data.date;
        results.sheets_op1.sheetsList = Object.keys(response.data.data || {});
      } else {
        results.sheets_op1.error = response.data ? response.data.error : 'unknown error';
      }
    } catch (err) {
      results.sheets_op1.error = err.message;
    }
  } else {
    results.sheets_op1.error = 'URL not configured';
  }

  res.json({
    success: (results.sheets.ok || !APPS_SCRIPT_URL) && (results.sheets_op1.ok || !APPS_SCRIPT_URL_OP1),
    results
  });
});

/**
 * Fetch available sheets list (tabs) dynamically from Google Spreadsheet Apps Script
 * POST /api/fetch-sheets-list
 */
app.post('/api/fetch-sheets-list', authMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  try {
    const response = await axios.get(url, {
      params: { action: 'listSheets' },
      timeout: 10000
    });
    if (response.data && response.data.ok) {
      res.json({
        success: true,
        sheets: response.data.sheets || []
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.data ? response.data.error : 'Failed to retrieve sheets list'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Manual trigger endpoint for report sending
 * POST /send-report
 * Accepts optional JSON body: { "date": "26.05.2026" }
 */
app.post('/send-report', authMiddleware, async (req, res) => {
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
 * Fetch all managers from Binotel and merge with active whitelist configurations
 * GET /api/binotel/managers
 */
app.get('/api/binotel/managers', authMiddleware, async (req, res) => {
  try {
    if (!config.BINOTEL_API_KEY || !config.BINOTEL_API_SECRET || !config.BINOTEL_COMPANY_ID) {
      return res.json({ 
        success: false, 
        error: 'credentials_missing',
        message: 'Binotel API credentials are not configured.' 
      });
    }

    const binotelService = require('./services/binotel.service');
    const employees = await binotelService.fetchEmployees();
    
    const activeList = config.BINOTEL_ACTIVE_MANAGERS 
      ? config.BINOTEL_ACTIVE_MANAGERS.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0)
      : [];
    const activeSet = new Set(activeList);

    const managers = [];
    for (const [email, emp] of Object.entries(employees)) {
      const normEmail = email.trim().toLowerCase();
      managers.push({
        email: normEmail,
        name: emp.name || email,
        internalNumber: emp.endpointData ? emp.endpointData.internalNumber : null,
        active: activeSet.has(normEmail)
      });
    }

    // Sort alphabetically by name
    managers.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    res.json({
      success: true,
      managers
    });
  } catch (err) {
    logger.error('Error in GET /api/binotel/managers:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'binotel_error', 
      message: err.message 
    });
  }
});

/**
 * Save whitelisted active managers selection
 * POST /api/binotel/managers
 */
app.post('/api/binotel/managers', authMiddleware, async (req, res) => {
  const { activeEmails } = req.body;
  if (!Array.isArray(activeEmails)) {
    return res.status(400).json({ success: false, error: 'activeEmails must be an array' });
  }

  try {
    const listString = activeEmails.map(e => e.trim().toLowerCase()).join(',');
    const success = await config.saveSettings({
      ...config.getRawSettings(),
      BINOTEL_ACTIVE_MANAGERS: listString
    });

    if (success) {
      res.json({ success: true, message: 'Active managers updated successfully.' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to write settings database.' });
    }
  } catch (err) {
    logger.error('Error in POST /api/binotel/managers:', err.message);
    res.status(500).json({ success: false, error: err.message });
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
