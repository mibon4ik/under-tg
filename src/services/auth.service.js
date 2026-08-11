const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// File paths for offline fallback
const usersFilePath = path.join(__dirname, '../config/users.json');
const sessionsFilePath = path.join(__dirname, '../config/sessions.json');

let dbPool = null;

// Memory storage cache for local fallback
let localUsers = {};
let localSessions = {};

// Helper to hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper to generate a strong random token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Load local fallback files
function loadLocalAuth() {
  try {
    if (fs.existsSync(usersFilePath)) {
      localUsers = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    }
    if (fs.existsSync(sessionsFilePath)) {
      localSessions = JSON.parse(fs.readFileSync(sessionsFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('[Auth-Local] Failed to load local auth files:', err.message);
  }
}

// Save local fallback files
function saveLocalUsers() {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(localUsers, null, 2), 'utf8');
  } catch (err) {
    console.error('[Auth-Local] Failed to save users file:', err.message);
  }
}

function saveLocalSessions() {
  try {
    fs.writeFileSync(sessionsFilePath, JSON.stringify(localSessions, null, 2), 'utf8');
  } catch (err) {
    console.error('[Auth-Local] Failed to save sessions file:', err.message);
  }
}

/**
 * Initialize Database and Auth Schemas
 */
async function initAuthDb(pool, defaultPassword = 'admin') {
  dbPool = pool;
  const adminPasswordHash = hashPassword(defaultPassword);

  if (dbPool) {
    try {
      console.log('[Auth] Initializing authentication tables in PostgreSQL...');
      
      // 1. Create users table
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          username VARCHAR(255) PRIMARY KEY,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. Create sessions table
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          token VARCHAR(255) PRIMARY KEY,
          username VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP
        )
      `);

      console.log('[Auth] Database tables verified.');

      // 3. Ensure default admin user exists
      const res = await dbPool.query('SELECT * FROM users WHERE username = $1', ['admin']);
      if (res.rows.length === 0) {
        console.log('[Auth] Creating default admin user in PostgreSQL...');
        await dbPool.query(`
          INSERT INTO users (username, password_hash)
          VALUES ($1, $2)
        `, ['admin', adminPasswordHash]);
      }
    } catch (err) {
      console.error('[Auth] Failed to initialize database tables:', err.message);
      // Fallback to local files if PG fails
      dbPool = null;
      initLocalAuth(defaultPassword);
    }
  } else {
    initLocalAuth(defaultPassword);
  }
}

function initLocalAuth(defaultPassword) {
  console.log('[Auth-Local] Initializing offline file-based authentication...');
  loadLocalAuth();
  if (!localUsers.admin) {
    console.log('[Auth-Local] Creating default admin user in local JSON...');
    localUsers.admin = {
      username: 'admin',
      password_hash: hashPassword(defaultPassword),
      created_at: new Date().toISOString()
    };
    saveLocalUsers();
  }
}

/**
 * Authenticate credentials
 */
async function authenticateUser(username, password) {
  const enteredHash = hashPassword(password);
  
  if (dbPool) {
    try {
      const res = await dbPool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (res.rows.length > 0) {
        const user = res.rows[0];
        return user.password_hash === enteredHash;
      }
      return false;
    } catch (err) {
      console.error('[Auth] Error authenticating user, falling back to local auth:', err.message);
      return authenticateLocalUser(username, enteredHash);
    }
  } else {
    return authenticateLocalUser(username, enteredHash);
  }
}

function authenticateLocalUser(username, enteredHash) {
  const user = localUsers[username];
  if (user) {
    return user.password_hash === enteredHash;
  }
  return false;
}

/**
 * Create a new active session
 */
async function createSession(username) {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Session valid for 7 days

  if (dbPool) {
    try {
      await dbPool.query(`
        INSERT INTO sessions (token, username, expires_at)
        VALUES ($1, $2, $3)
      `, [token, username, expiresAt]);
      return token;
    } catch (err) {
      console.error('[Auth] Error creating database session:', err.message);
      // fallback session
      return createLocalSession(username, token, expiresAt);
    }
  } else {
    return createLocalSession(username, token, expiresAt);
  }
}

function createLocalSession(username, token, expiresAt) {
  localSessions[token] = {
    token,
    username,
    expires_at: expiresAt.toISOString()
  };
  saveLocalSessions();
  return token;
}

/**
 * Validate session token
 */
async function validateSession(token) {
  if (!token) return null;

  if (dbPool) {
    try {
      const res = await dbPool.query(`
        SELECT * FROM sessions 
        WHERE token = $1 AND (expires_at IS NULL OR expires_at > NOW())
      `, [token]);
      
      if (res.rows.length > 0) {
        return res.rows[0]; // { token, username, created_at, expires_at }
      }
      return null;
    } catch (err) {
      console.error('[Auth] Error validating database session:', err.message);
      return validateLocalSession(token);
    }
  } else {
    return validateLocalSession(token);
  }
}

function validateLocalSession(token) {
  const session = localSessions[token];
  if (!session) return null;

  const expiresAt = new Date(session.expires_at);
  if (expiresAt < new Date()) {
    delete localSessions[token];
    saveLocalSessions();
    return null;
  }
  return session;
}

/**
 * Update password for a user
 */
async function updateUserPassword(username, newPassword) {
  const newHash = hashPassword(newPassword);

  if (dbPool) {
    try {
      console.log(`[Auth] Updating password in PostgreSQL for user ${username}...`);
      await dbPool.query(`
        UPDATE users 
        SET password_hash = $1 
        WHERE username = $2
      `, [newHash, username]);
      
      // Revoke older sessions for this user for security
      await dbPool.query('DELETE FROM sessions WHERE username = $1', [username]);
      console.log(`[Auth] Password updated successfully for user ${username}.`);
      return true;
    } catch (err) {
      console.error('[Auth] Error updating user password:', err.message);
      return false;
    }
  } else {
    if (localUsers[username]) {
      localUsers[username].password_hash = newHash;
      saveLocalUsers();
      // Revoke local sessions
      for (const token in localSessions) {
        if (localSessions[token].username === username) {
          delete localSessions[token];
        }
      }
      saveLocalSessions();
      console.log(`[Auth-Local] Password updated successfully for user ${username}.`);
      return true;
    }
    return false;
  }
}

/**
 * Delete session token (logout)
 */
async function deleteSession(token) {
  if (dbPool) {
    try {
      await dbPool.query('DELETE FROM sessions WHERE token = $1', [token]);
      return true;
    } catch (err) {
      console.error('[Auth] Error deleting database session:', err.message);
      return false;
    }
  } else {
    if (localSessions[token]) {
      delete localSessions[token];
      saveLocalSessions();
      return true;
    }
    return false;
  }
}

module.exports = {
  initAuthDb,
  authenticateUser,
  createSession,
  validateSession,
  updateUserPassword,
  deleteSession
};
