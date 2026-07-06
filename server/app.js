const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const {
  openDb, getSettings, setSettings, hashValue, wilsonScore, normalizePageKey, getOrCreatePage
} = require('./db');
const { sendReplyNotification, sendTest } = require('./mailer');
const { analyzeDisqusXml, importDisqusXml } = require('./disqus-import');
const { buildRss } = require('./rss');
const EMBED_SOURCE = require('./embed-template');

const STATUSES = new Set(['pending', 'approved', 'spam', 'deleted']);
const SORTS = new Set(['best', 'newest', 'oldest']);

function getIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '?';
}

function getToken(req) {
  return String(req.headers['x-chatterbox-token'] || req.body?.token || req.query?.token || '').slice(0, 128);
}

function commentAgeMs(createdAt) {
  const iso = createdAt.includes('Z') ? createdAt : createdAt + 'Z';
  return Date.now() - new Date(iso).getTime();
}

function signUnsubscribeToken(secret, commentId) {
  const payload = String(commentId);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifyUnsubscribeToken(secret, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  let payload;
  try { payload = Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const id = Number(payload);
  return Number.isInteger(id) ? id : null;
}

function buildTree(rows, sort) {
  const byParent = new Map();
  for (const r of rows) {
    const key = r.parent_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(r);
  }
  function sortFn(a, b) {
    if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    return wilsonScore(b.upvotes, b.downvotes) - wilsonScore(a.upvotes, a.downvotes);
  }
  function build(parentKey, depth) {
    const children = (byParent.get(parentKey) || []).slice().sort(sortFn);
    return children.map((c) => ({ ...c, depth, replies: build(c.id, depth + 1) }));
  }
  return build('root', 1);
}

function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const adminPassword = opts.adminPassword || process.env.ADMIN_PASSWORD || 'admin';
  const autologinToken = opts.autologinToken || process.env.AUTOLOGIN_TOKEN || null;
  const rateLimitMax = opts.rateLimitMax ?? 5; // comment posts / IP / window
  const rateLimitWindowMs = opts.rateLimitWindowMs ?? 10 * 60_000; // 10 min

  const db = openDb(dataDir);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());

  // ---- sessions (persisted in the sessions table, simple by design) ----
  function newSession(res) {
    const sid = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (id, token) VALUES (?, ?)').run(sid, sid);
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  }
  function hasSession(sid) {
    return !!sid && !!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sid);
  }
  function requireAuth(req, res, next) {
    if (hasSession(req.cookies.sid)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  }

  // ---- rate limiting (in-memory sliding window per IP, widget comment posts only) ----
  const hits = new Map();
  function rateLimited(ip) {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < rateLimitWindowMs);
    if (arr.length >= rateLimitMax) { hits.set(ip, arr); return true; }
    arr.push(now);
    hits.set(ip, arr);
    return false;
  }
  const rateLimitInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of hits) {
      const live = arr.filter((t) => now - t < rateLimitWindowMs);
      if (live.length) hits.set(ip, live); else hits.delete(ip);
    }
  }, 5 * 60_000);
  rateLimitInterval.unref();

  // ---- CORS: widget/public endpoints run on customers' sites ----
  const PUBLIC_PREFIXES = ['/embed.js', '/api/widget/', '/rss.xml', '/unsubscribe/'];
  app.use((req, res, next) => {
    if (PUBLIC_PREFIXES.some((p) => req.path === p || req.path.startsWith(p))) {
      const settings = getSettings(db);
      const allowed = settings.allowed_origins || '*';
      const origin = req.headers.origin;
      if (allowed === '*') res.set('Access-Control-Allow-Origin', '*');
      else if (origin && allowed.split(',').map((s) => s.trim()).includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
      }
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Chatterbox-Token');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });

  // ================= WIDGET (public) =================

  app.get('/embed.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/javascript').send(EMBED_SOURCE);
  });

  app.get('/api/widget/comments', (req, res) => {
    const pageKey = normalizePageKey(String(req.query.page_key || ''));
    if (!pageKey) return res.status(400).json({ error: 'page_key required' });
    const page = db.prepare('SELECT * FROM pages WHERE page_key = ?').get(pageKey);
    if (!page) return res.json({ page: null, comments: [] });

    const settings = getSettings(db);
    const token = getToken(req);
    const tokenHash = token ? hashValue(token, settings.ip_salt) : null;
    const sort = SORTS.has(req.query.sort) ? req.query.sort : 'best';

    let rows = db.prepare(
      `SELECT * FROM comments WHERE page_id = ? AND (status = 'approved' OR (status = 'pending' AND author_token_hash = ?))`
    ).all(page.id, tokenHash || '\0none\0');

    const voteRows = db.prepare(
      `SELECT comment_id,
        SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS up,
        SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down
       FROM votes GROUP BY comment_id`
    ).all();
    const voteMap = Object.fromEntries(voteRows.map((v) => [v.comment_id, v]));

    rows = rows.map((r) => {
      const v = voteMap[r.id] || { up: 0, down: 0 };
      return { ...r, upvotes: v.up || 0, downvotes: v.down || 0, score: (v.up || 0) - (v.down || 0), pending: r.status === 'pending' };
    });

    res.json({
      page: { id: page.id, page_key: page.page_key, title: page.title, comments_locked: !!page.comments_locked },
      comments: buildTree(rows, sort)
    });
  });

  app.post('/api/widget/comments', async (req, res) => {
    const b = req.body || {};
    const pageKey = normalizePageKey(String(b.page_key || ''));
    if (!pageKey) return res.status(400).json({ error: 'page_key required' });

    const settings = getSettings(db);
    const ip = getIp(req);
    const ipHash = hashValue(ip, settings.ip_salt);
    const token = getToken(req) || ip;
    const tokenHash = hashValue(token, settings.ip_salt);

    // honeypot: bots fill the hidden field — pretend success, never tip them off
    const isBot = typeof b.hp === 'string' && b.hp.trim() !== '';

    if (!isBot && rateLimited(ip)) return res.status(429).json({ error: 'Too many comments, slow down' });

    const page = getOrCreatePage(db, pageKey, b.page_title, b.page_url || pageKey);
    if (page.comments_locked && !isBot) return res.status(403).json({ error: 'Comments are locked on this page' });

    const name = String(b.name || '').trim().slice(0, 120) || 'Anonymous';
    const email = String(b.email || '').trim().slice(0, 254);
    const body = String(b.body || '').trim().slice(0, 10000);
    if (!isBot && !body) return res.status(400).json({ error: 'Comment body required' });

    const parentId = b.parent_id ? Number(b.parent_id) : null;
    if (parentId) {
      const parent = db.prepare('SELECT id FROM comments WHERE id = ? AND page_id = ?').get(parentId, page.id);
      if (!parent && !isBot) return res.status(400).json({ error: 'Unknown parent comment' });
    }

    const blockedIp = db.prepare(`SELECT 1 FROM blocks WHERE kind = 'ip_hash' AND value = ?`).get(ipHash);
    const blockedEmail = email && db.prepare(`SELECT 1 FROM blocks WHERE kind = 'email' AND value = ?`).get(email.toLowerCase());

    const elapsedMs = Number(b.elapsed_ms);
    const tooFast = !Number.isFinite(elapsedMs) || elapsedMs < 3000;
    const linkCount = (body.match(/https?:\/\//g) || []).length;

    let status;
    if (isBot || blockedIp || blockedEmail) status = 'spam';
    else if (linkCount > 3) status = 'pending';
    else if (tooFast) status = 'pending';
    else status = settings.approve_first === '1' ? 'pending' : 'approved';

    const notify = b.notify ? 1 : 0;

    const info = db.prepare(
      `INSERT INTO comments (page_id, parent_id, author_name, author_email, author_token_hash, body, status, ip_hash, notify, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(page.id, parentId, name, email || null, tokenHash, body, status, ipHash, notify);
    const commentId = info.lastInsertRowid;

    if (status === 'approved' && parentId) {
      const parent = db.prepare('SELECT * FROM comments WHERE id = ?').get(parentId);
      if (parent && parent.notify === 1 && parent.author_email) {
        const unsubToken = signUnsubscribeToken(settings.hmac_secret, parent.id);
        const base = settings.base_url || opts.baseUrl || `http://127.0.0.1:${req.socket.localPort || ''}`;
        const unsubscribeUrl = `${base}/unsubscribe/${unsubToken}`;
        await sendReplyNotification(db, settings, {
          parentComment: parent,
          replyComment: { id: commentId, author_name: name, body },
          page,
          unsubscribeUrl
        });
      }
    }

    // response shape is identical for humans and bots — never tip off spammers
    res.status(201).json({ ok: true, id: commentId });
  });

  app.put('/api/widget/comments/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const settings = getSettings(db);
    const tokenHash = hashValue(getToken(req), settings.ip_salt);
    if (tokenHash !== c.author_token_hash) return res.status(403).json({ error: 'Not your comment' });
    if (commentAgeMs(c.created_at) > 15 * 60_000) return res.status(403).json({ error: 'Edit window has expired' });
    const body = String(req.body?.body || '').trim().slice(0, 10000);
    if (!body) return res.status(400).json({ error: 'Body required' });
    db.prepare(`UPDATE comments SET body = ?, edited_at = datetime('now') WHERE id = ?`).run(body, c.id);
    res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(c.id));
  });

  app.delete('/api/widget/comments/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const settings = getSettings(db);
    const tokenHash = hashValue(getToken(req), settings.ip_salt);
    if (tokenHash !== c.author_token_hash) return res.status(403).json({ error: 'Not your comment' });
    if (commentAgeMs(c.created_at) > 15 * 60_000) return res.status(403).json({ error: 'Edit window has expired' });
    db.prepare(`UPDATE comments SET status = 'deleted' WHERE id = ?`).run(c.id);
    res.json({ ok: true });
  });

  app.post('/api/widget/comments/:id/vote', (req, res) => {
    const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Not found' });
    const value = Number(req.body?.value);
    if (value !== 1 && value !== -1) return res.status(400).json({ error: 'value must be 1 or -1' });
    const settings = getSettings(db);
    const voterHash = hashValue(getToken(req) || getIp(req), settings.ip_salt);
    db.prepare(
      `INSERT INTO votes (comment_id, voter_token_hash, value) VALUES (?, ?, ?)
       ON CONFLICT(comment_id, voter_token_hash) DO UPDATE SET value = excluded.value`
    ).run(comment.id, voterHash, value);
    const v = db.prepare(
      `SELECT SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS down
       FROM votes WHERE comment_id = ?`
    ).get(comment.id);
    res.json({ ok: true, upvotes: v.up || 0, downvotes: v.down || 0, score: (v.up || 0) - (v.down || 0) });
  });

  app.get('/unsubscribe/:token', (req, res) => {
    const settings = getSettings(db);
    const commentId = verifyUnsubscribeToken(settings.hmac_secret, req.params.token);
    if (!commentId) return res.status(400).type('html').send('<h1>Invalid or expired unsubscribe link</h1>');
    db.prepare('UPDATE comments SET notify = 0 WHERE id = ?').run(commentId);
    res.type('html').send('<h1>Unsubscribed</h1><p>You will no longer receive reply notifications for this comment.</p>');
  });

  app.get('/rss.xml', (req, res) => {
    const settings = getSettings(db);
    const baseUrl = settings.base_url || `${req.protocol}://${req.get('host')}`;
    res.type('application/rss+xml').send(buildRss(db, baseUrl));
  });

  // ================= AUTH =================

  app.post('/api/login', (req, res) => {
    if (String(req.body?.password || '') !== adminPassword) {
      return res.status(401).json({ error: 'Wrong password' });
    }
    newSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.cookies.sid);
    res.clearCookie('sid');
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => {
    res.json({ authed: hasSession(req.cookies.sid) });
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'chatterbox' }));

  // desktop mode auto-login
  app.get('/auth/auto', (req, res) => {
    if (!autologinToken || req.query.token !== autologinToken) return res.status(403).send('Forbidden');
    newSession(res);
    res.redirect('/admin/');
  });

  // ================= ADMIN: MODERATION QUEUE =================

  app.get('/api/comments', requireAuth, (req, res) => {
    const status = STATUSES.has(req.query.status) ? req.query.status : null;
    const perPage = 50;
    const page = Math.max(1, Number(req.query.page) || 1);
    const where = status ? 'WHERE c.status = ?' : '';
    const params = status ? [status] : [];
    const rows = db.prepare(
      `SELECT c.*, p.title AS page_title, p.page_key AS page_key
       FROM comments c JOIN pages p ON p.id = c.page_id ${where}
       ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, (page - 1) * perPage);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM comments c ${where}`).get(...params).n;
    res.json({ comments: rows, total, page, perPage });
  });

  function setStatus(id, status) {
    const info = db.prepare('UPDATE comments SET status = ? WHERE id = ?').run(status, id);
    return info.changes > 0;
  }

  app.post('/api/comments/:id/approve', requireAuth, (req, res) => {
    if (!setStatus(req.params.id, 'approved')) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id));
  });
  app.post('/api/comments/:id/spam', requireAuth, (req, res) => {
    if (!setStatus(req.params.id, 'spam')) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id));
  });
  app.post('/api/comments/:id/delete', requireAuth, (req, res) => {
    if (!setStatus(req.params.id, 'deleted')) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id));
  });

  app.post('/api/comments/bulk', requireAuth, (req, res) => {
    const { ids, action } = req.body || {};
    const actionMap = { approve: 'approved', spam: 'spam', delete: 'deleted' };
    const status = actionMap[action];
    if (!status || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids[] and a valid action are required' });
    const stmt = db.prepare('UPDATE comments SET status = ? WHERE id = ?');
    const tx = db.transaction((list) => { for (const id of list) stmt.run(status, id); });
    tx(ids);
    res.json({ ok: true, updated: ids.length });
  });

  // ================= ADMIN: PAGES =================

  app.get('/api/pages', requireAuth, (req, res) => {
    const rows = db.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.page_id = p.id) AS comment_count
       FROM pages p ORDER BY p.created_at DESC`
    ).all();
    res.json(rows);
  });

  app.post('/api/pages/:id/lock', requireAuth, (req, res) => {
    const locked = req.body?.locked ? 1 : 0;
    const info = db.prepare('UPDATE pages SET comments_locked = ? WHERE id = ?').run(locked, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json(db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id));
  });

  // ================= ADMIN: BLOCKS =================

  app.get('/api/blocks', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM blocks ORDER BY created_at DESC').all());
  });
  app.post('/api/blocks', requireAuth, (req, res) => {
    const kind = req.body?.kind === 'ip_hash' ? 'ip_hash' : req.body?.kind === 'email' ? 'email' : null;
    const value = String(req.body?.value || '').trim();
    if (!kind || !value) return res.status(400).json({ error: 'kind (email|ip_hash) and value are required' });
    const info = db.prepare('INSERT INTO blocks (kind, value) VALUES (?, ?)').run(kind, kind === 'email' ? value.toLowerCase() : value);
    res.status(201).json(db.prepare('SELECT * FROM blocks WHERE id = ?').get(info.lastInsertRowid));
  });
  app.delete('/api/blocks/:id', requireAuth, (req, res) => {
    const info = db.prepare('DELETE FROM blocks WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });

  // ================= ADMIN: SETTINGS =================

  app.get('/api/settings', requireAuth, (req, res) => {
    const s = getSettings(db);
    const { ip_salt, hmac_secret, smtp_pass, ...safe } = s;
    res.json({ ...safe, smtp_pass: smtp_pass ? '••••••••' : '' });
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    const b = { ...(req.body || {}) };
    if (b.smtp_pass === '••••••••') delete b.smtp_pass;
    setSettings(db, b);
    const s = getSettings(db);
    const { ip_salt, hmac_secret, smtp_pass, ...safe } = s;
    res.json({ ...safe, smtp_pass: smtp_pass ? '••••••••' : '' });
  });

  app.post('/api/settings/test-email', requireAuth, async (req, res) => {
    const to = String(req.body?.to || '').trim();
    if (!to) return res.status(400).json({ error: 'Recipient required' });
    try {
      await sendTest(getSettings(db), to);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ================= ADMIN: DISQUS IMPORT =================

  const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  let lastImportStatus = null;

  app.post('/api/import/disqus', requireAuth, importUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No XML file received' });
    const xml = req.file.buffer.toString('utf8');
    const dryRun = req.query.dry_run === '1';
    try {
      if (dryRun) {
        return res.json({ dry_run: true, ...analyzeDisqusXml(xml) });
      }
      const result = importDisqusXml(db, xml);
      lastImportStatus = { ...result, at: new Date().toISOString() };
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: `Import failed: ${e.message}` });
    }
  });

  app.get('/api/import/status', requireAuth, (req, res) => res.json(lastImportStatus || { at: null }));

  // ================= ADMIN SPA =================

  const distDir = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distDir)) {
    app.use('/admin', express.static(distDir));
    app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }
  app.get('/', (req, res) => res.redirect('/admin/'));

  app._db = db; // exposed for tests
  return app;
}

module.exports = { createApp };
