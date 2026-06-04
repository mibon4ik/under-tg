const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const multer = require('multer');
const reportService = require('./services/report.service');
const logger = require('./utils/logger');
const telegramService = require('./services/telegram.service');
const config = require('./config/config');
const authService = require('./services/auth.service');

const app = express();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration for temporary files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

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
      try {
        const schedulerService = require('./services/scheduler.service');
        schedulerService.restart();
      } catch (schedErr) {
        logger.error('Failed to restart scheduler on settings save:', schedErr.message);
      }
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
 * Fetch all managers from amoCRM and merge with active whitelist configurations
 * GET /api/amocrm/managers
 */
app.get('/api/amocrm/managers', authMiddleware, async (req, res) => {
  try {
    if (!config.AMO_SUBDOMAIN || !config.AMO_INTEGRATION_TOKEN) {
      return res.json({ 
        success: false, 
        error: 'credentials_missing',
        message: 'amoCRM credentials are not configured.' 
      });
    }

    const amocrmService = require('./services/amocrm.service');
    const users = await amocrmService.fetchUsers();
    
    const activeList = config.AMO_ACTIVE_MANAGERS 
      ? config.AMO_ACTIVE_MANAGERS.split(',').map(id => id.trim()).filter(id => id.length > 0)
      : [];
    const activeSet = new Set(activeList);

    const managers = [];
    for (const u of users) {
      const uIdStr = String(u.id);
      managers.push({
        id: u.id,
        name: u.name || u.email || uIdStr,
        email: u.email || '',
        active: activeSet.has(uIdStr)
      });
    }

    // Sort alphabetically by name
    managers.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    res.json({
      success: true,
      managers
    });
  } catch (err) {
    logger.error('Error in GET /api/amocrm/managers:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'amocrm_error', 
      message: err.message 
    });
  }
});

/**
 * Save whitelisted active amoCRM managers selection
 * POST /api/amocrm/managers
 */
app.post('/api/amocrm/managers', authMiddleware, async (req, res) => {
  const { activeIds } = req.body;
  if (!Array.isArray(activeIds)) {
    return res.status(400).json({ success: false, error: 'activeIds must be an array' });
  }

  try {
    const listString = activeIds.map(id => String(id).trim()).join(',');
    const success = await config.saveSettings({
      ...config.getRawSettings(),
      AMO_ACTIVE_MANAGERS: listString
    });

    if (success) {
      res.json({ success: true, message: 'Active amoCRM managers updated successfully.' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to write settings database.' });
    }
  } catch (err) {
    logger.error('Error in POST /api/amocrm/managers:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Test amoCRM connection live
 * POST /api/test-amocrm
 */
app.post('/api/test-amocrm', authMiddleware, async (req, res) => {
  const { AMO_SUBDOMAIN, AMO_INTEGRATION_TOKEN } = req.body;
  if (!AMO_SUBDOMAIN || !AMO_INTEGRATION_TOKEN) {
    return res.status(400).json({ success: false, error: 'AMO_SUBDOMAIN and AMO_INTEGRATION_TOKEN are required' });
  }

  try {
    // Temporarily override keys in configuration to test connection
    const originalSubdomain = config.AMO_SUBDOMAIN;
    const originalToken = config.AMO_INTEGRATION_TOKEN;
    
    await config.saveSettings({
      ...config.getRawSettings(),
      AMO_SUBDOMAIN,
      AMO_INTEGRATION_TOKEN
    });

    const amocrmService = require('./services/amocrm.service');
    const users = await amocrmService.fetchUsers();

    // Restore original keys in memory
    await config.saveSettings({
      ...config.getRawSettings(),
      AMO_SUBDOMAIN: originalSubdomain,
      AMO_INTEGRATION_TOKEN: originalToken
    });

    res.json({
      success: true,
      usersCount: users.length,
      message: `Успешное подключение! Найдено пользователей: ${users.length}.`
    });
  } catch (err) {
    logger.error('Error in /api/test-amocrm:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Manual trigger endpoint for amoCRM report sending
 * POST /send-amocrm-report
 * Accepts optional JSON body: { "date": "26.05.2026" }
 */
app.post('/send-amocrm-report', authMiddleware, async (req, res) => {
  logger.info('Manual amoCRM report trigger endpoint received a request.');
  
  const targetDate = req.body && req.body.date ? String(req.body.date).trim() : null;

  try {
    const result = await reportService.generateAndSendAmoReport(targetDate);
    
    if (result.success) {
      return res.json({
        success: true,
        message: `amoCRM report generated successfully for date: ${targetDate || 'today'}.`,
        telegram: result.telegramResults,
        reportPreview: result.text
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to process amoCRM report.'
      });
    }
  } catch (err) {
    logger.error('Error occurred in /send-amocrm-report endpoint handler:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Deduplicate contacts file against amoCRM
 * POST /api/amocrm/deduplicate
 */
app.post('/api/amocrm/deduplicate', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Файл не загружен.' });
  }

  const phoneCol = req.body.phoneColumn || 'Рабочий телефон';
  
  // Use current configuration keys
  const subdomain = config.AMO_SUBDOMAIN;
  const token = config.AMO_INTEGRATION_TOKEN;

  if (!subdomain || !token) {
    // Remove the uploaded file first
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ 
      success: false, 
      error: 'Учетные данные amoCRM не настроены. Пожалуйста, сохраните субдомен и токен доступа в настройках интеграции.' 
    });
  }

  const inputFilePath = req.file.path;
  const outputFileName = `clean_import-${Date.now()}.xlsx`;
  const outputFilePath = path.join(uploadDir, outputFileName);
  const errorLogFileName = `dedup_errors-${Date.now()}.log`;
  const errorLogPath = path.join(uploadDir, errorLogFileName);

  const pythonScript = path.join(__dirname, 'services/dedup.py');

  // Launch python process
  const args = [
    pythonScript,
    '--file', inputFilePath,
    '--output', outputFilePath,
    '--subdomain', subdomain,
    '--token', token,
    '--phone-col', phoneCol,
    '--error-log', errorLogPath
  ];

  logger.info(`Running python script for deduplication of file: ${req.file.originalname}`);

  execFile('python', args, (error, stdout, stderr) => {
    // Always clean up the uploaded input file
    try { fs.unlinkSync(inputFilePath); } catch (e) {}

    if (stderr) {
      logger.error(`Python stderr: ${stderr}`);
    }

    if (error) {
      logger.error(`Python process failed: ${error.message}`);
      // Clean up files in case of failure
      try { fs.unlinkSync(outputFilePath); } catch (e) {}
      try { fs.unlinkSync(errorLogPath); } catch (e) {}
      
      return res.status(500).json({ 
        success: false, 
        error: `Ошибка при обработке файла: ${error.message}. Убедитесь, что все зависимости Python установлены.` 
      });
    }

    try {
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      const result = JSON.parse(lastLine);

      if (result.success) {
        res.json({
          success: true,
          stats: result.stats,
          cleanFileId: outputFileName,
          errorLogId: errorLogFileName
        });
      } else {
        try { fs.unlinkSync(outputFilePath); } catch (e) {}
        try { fs.unlinkSync(errorLogPath); } catch (e) {}
        res.status(400).json({
          success: false,
          error: result.error || 'Неизвестная ошибка в скрипте дедупликации.'
        });
      }
    } catch (parseErr) {
      logger.error(`Failed to parse Python stdout: ${stdout}`);
      try { fs.unlinkSync(outputFilePath); } catch (e) {}
      try { fs.unlinkSync(errorLogPath); } catch (e) {}
      res.status(500).json({
        success: false,
        error: 'Не удалось прочитать результаты дедупликации.'
      });
    }
  });
});

/**
 * Download deduplicated clean file
 * GET /api/amocrm/download/:fileId
 */
app.get('/api/amocrm/download/:fileId', authMiddleware, (req, res) => {
  const fileId = req.params.fileId;
  if (fileId.includes('..') || fileId.includes('/') || fileId.includes('\\')) {
    return res.status(400).json({ error: 'Неверный идентификатор файла.' });
  }

  const filePath = path.join(uploadDir, fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл не найден или срок его хранения истек.' });
  }

  res.download(filePath, 'clean_import.xlsx', (err) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
  });
});

/**
 * Download/view deduplication error logs
 * GET /api/amocrm/log/:logId
 */
app.get('/api/amocrm/log/:logId', authMiddleware, (req, res) => {
  const logId = req.params.logId;
  if (logId.includes('..') || logId.includes('/') || logId.includes('\\')) {
    return res.status(400).json({ error: 'Неверный идентификатор лога.' });
  }

  const logPath = path.join(uploadDir, logId);
  if (!fs.existsSync(logPath)) {
    return res.status(404).json({ error: 'Лог не найден или срок его хранения истек.' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(logPath, (err) => {
    try { fs.unlinkSync(logPath); } catch (e) {}
  });
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
