// Disqus XML export importer. Full-parse via fast-xml-parser (streaming not required
// per spec — prioritize correctness + smoke test passing over huge-file streaming).
// Idempotent: re-importing the same export is a no-op thanks to the UNIQUE(disqus_id)
// constraint on comments — every insert is check-then-skip.
const { XMLParser } = require('fast-xml-parser');
const { normalizePageKey } = require('./db');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true });

function arrayify(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDisqusXml(xmlString) {
  const parsed = parser.parse(xmlString);
  const channel = parsed?.rss?.channel || {};
  const threads = arrayify(channel.thread);
  const posts = arrayify(channel.post);
  return { threads, posts };
}

function threadId(t) {
  return String(t?.['dsq:id'] ?? t?.id ?? '');
}
function postId(p) {
  return String(p?.['dsq:id'] ?? p?.id ?? '');
}
function parentIdOf(p) {
  const ref = p?.parent;
  if (!ref) return '';
  return String(ref?.['dsq:id'] ?? ref?.id ?? '').trim();
}
function threadRefOf(p) {
  const ref = p?.thread;
  if (!ref) return '';
  return String(ref?.['dsq:id'] ?? ref?.id ?? '').trim();
}

// Dry-run: counts only, no writes.
function analyzeDisqusXml(xmlString) {
  const { threads, posts } = parseDisqusXml(xmlString);
  return { pages: threads.length, comments: posts.length };
}

// Commit: creates pages + comments, preserves parent linkage and timestamps.
// Returns counts of what was actually created (idempotent on re-run).
function importDisqusXml(db, xmlString) {
  const { threads, posts } = parseDisqusXml(xmlString);

  let pagesCreated = 0;
  let commentsCreated = 0;
  let commentsSkipped = 0;

  const findPage = db.prepare('SELECT id FROM pages WHERE page_key = ?');
  const insertPage = db.prepare('INSERT INTO pages (page_key, title, url) VALUES (?, ?, ?)');
  const findByDisqusId = db.prepare('SELECT id FROM comments WHERE disqus_id = ?');
  const insertComment = db.prepare(`
    INSERT INTO comments (page_id, parent_id, author_name, author_email, author_token_hash, body, status, ip_hash, notify, disqus_id, created_at)
    VALUES (@page_id, NULL, @author_name, @author_email, 'imported', @body, @status, '', 0, @disqus_id, @created_at)
  `);
  const setParent = db.prepare('UPDATE comments SET parent_id = ? WHERE id = ?');

  const tx = db.transaction(() => {
    const pageIdByThread = {};
    for (const t of threads) {
      const key = normalizePageKey(t.link || threadId(t));
      let page = findPage.get(key);
      if (!page) {
        insertPage.run(key, String(t.title || key).slice(0, 300), String(t.link || '').slice(0, 2000));
        page = findPage.get(key);
        pagesCreated++;
      }
      pageIdByThread[threadId(t)] = page.id;
    }

    for (const p of posts) {
      const dId = postId(p);
      if (!dId) continue;
      if (findByDisqusId.get(dId)) { commentsSkipped++; continue; }
      const pageId = pageIdByThread[threadRefOf(p)];
      if (!pageId) { commentsSkipped++; continue; }

      const isSpam = String(p.isSpam).toLowerCase() === 'true';
      const isDeleted = String(p.isDeleted).toLowerCase() === 'true';
      const status = isSpam ? 'spam' : isDeleted ? 'deleted' : 'approved';

      insertComment.run({
        page_id: pageId,
        author_name: String(p.author?.name || 'Anonymous').slice(0, 120),
        author_email: p.author?.email ? String(p.author.email).slice(0, 254) : null,
        body: stripHtml(p.message).slice(0, 10000),
        status,
        disqus_id: dId,
        created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString()
      });
      commentsCreated++;
    }

    // second pass: wire up parent/child links now that every comment has a row
    for (const p of posts) {
      const dId = postId(p);
      const parentRef = parentIdOf(p);
      if (!dId || !parentRef) continue;
      const child = findByDisqusId.get(dId);
      const parent = findByDisqusId.get(parentRef);
      if (child && parent) setParent.run(parent.id, child.id);
    }
  });
  tx();

  return { pages: pagesCreated, comments: commentsCreated, skipped: commentsSkipped };
}

module.exports = { analyzeDisqusXml, importDisqusXml, parseDisqusXml, stripHtml };
