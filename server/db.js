const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  // Under Electron the Node-ABI binding won't load; use the vendored Electron prebuild.
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(path.join(dataDir, 'app.db'), nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      comments_locked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      parent_id INTEGER,
      author_name TEXT NOT NULL DEFAULT 'Anonymous',
      author_email TEXT,
      author_token_hash TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | spam | deleted
      ip_hash TEXT NOT NULL DEFAULT '',
      notify INTEGER NOT NULL DEFAULT 0,
      disqus_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      edited_at TEXT,
      FOREIGN KEY (page_id) REFERENCES pages(id),
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      voter_token_hash TEXT NOT NULL,
      value INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(comment_id, voter_token_hash),
      FOREIGN KEY (comment_id) REFERENCES comments(id)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,     -- email | ip_hash
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      to_email TEXT NOT NULL,
      kind TEXT NOT NULL,    -- reply | digest
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      ok INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id);
    CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
    CREATE INDEX IF NOT EXISTS idx_votes_comment ON votes(comment_id);
  `);

  // one-time secrets used for IP hashing and unsubscribe tokens; generated once, persisted forever
  const existing = db.prepare('SELECT key FROM settings WHERE key IN (?, ?)').all('ip_salt', 'hmac_secret');
  const have = new Set(existing.map((r) => r.key));
  const insertSecret = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  if (!have.has('ip_salt')) insertSecret.run('ip_salt', crypto.randomBytes(16).toString('hex'));
  if (!have.has('hmac_secret')) insertSecret.run('hmac_secret', crypto.randomBytes(24).toString('hex'));

  return db;
}

const SETTINGS_DEFAULTS = {
  approve_first: '0',
  allowed_origins: '*',
  accent: '#7c5cff',
  rate_limit_max: '5',
  rate_limit_window_ms: '600000',
  base_url: '',
  smtp_enabled: '0',
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: '0',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  ip_salt: '',
  hmac_secret: ''
};

function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...SETTINGS_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function setSettings(db, obj) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  // never allow the public API to overwrite the generated secrets
  const PROTECTED = new Set(['ip_salt', 'hmac_secret']);
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (k in SETTINGS_DEFAULTS && !PROTECTED.has(k)) stmt.run(k, String(v ?? ''));
    }
  });
  tx(Object.entries(obj));
}

function hashValue(value, salt) {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

// Wilson score lower bound for "best" sort ranking (z ~= 1.96, 95% confidence)
function wilsonScore(up, down) {
  const n = up + down;
  if (n === 0) return 0;
  const z = 1.96;
  const p = up / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}

// Strip utm_* params, trailing slash, and hash fragment so query-string variants
// of the same URL thread together instead of fragmenting comments.
function normalizePageKey(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    [...u.searchParams.keys()].forEach((k) => {
      if (/^utm_/i.test(k)) u.searchParams.delete(k);
    });
    let s = u.toString();
    s = s.replace(/\?$/, '');
    if (s.length > 1 && s.endsWith('/') && !s.endsWith('://')) s = s.replace(/\/+$/, '') || '/';
    return s;
  } catch {
    // not a full URL (e.g. a plain data-page-id slug) — use as-is, still strip hash
    return raw.split('#')[0].replace(/\/+$/, '') || raw;
  }
}

function getOrCreatePage(db, pageKey, title, url) {
  let page = db.prepare('SELECT * FROM pages WHERE page_key = ?').get(pageKey);
  if (!page) {
    db.prepare('INSERT INTO pages (page_key, title, url) VALUES (?, ?, ?)').run(
      pageKey,
      String(title || pageKey).slice(0, 300),
      String(url || pageKey).slice(0, 2000)
    );
    page = db.prepare('SELECT * FROM pages WHERE page_key = ?').get(pageKey);
  }
  return page;
}

module.exports = {
  openDb,
  getSettings,
  setSettings,
  hashValue,
  wilsonScore,
  normalizePageKey,
  getOrCreatePage,
  SETTINGS_DEFAULTS
};
