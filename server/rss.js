// GET /rss.xml — latest N approved comments site-wide, for moderation-by-feed-reader.
function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excerpt(body, len = 220) {
  const s = String(body || '');
  return s.length > len ? s.slice(0, len) + '…' : s;
}

function buildRss(db, baseUrl, limit = 50) {
  const rows = db.prepare(
    `SELECT c.id, c.author_name, c.body, c.created_at, p.title AS page_title, p.url AS page_url
     FROM comments c JOIN pages p ON p.id = c.page_id
     WHERE c.status = 'approved'
     ORDER BY c.created_at DESC LIMIT ?`
  ).all(limit);

  const items = rows.map((r) => {
    let pubDate;
    try { pubDate = new Date(r.created_at.includes('Z') ? r.created_at : r.created_at + 'Z').toUTCString(); }
    catch { pubDate = new Date().toUTCString(); }
    return `<item>
      <title>${escapeXml(r.author_name)} on ${escapeXml(r.page_title || r.page_url || 'a page')}</title>
      <description>${escapeXml(excerpt(r.body))}</description>
      <link>${escapeXml(r.page_url || baseUrl)}</link>
      <guid isPermaLink="false">comment-${r.id}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Chatterbox — Latest Comments</title>
<link>${escapeXml(baseUrl)}</link>
<description>Latest approved comments across all pages, for moderation by feed reader.</description>
${items}
</channel>
</rss>`;
}

module.exports = { buildRss, excerpt, escapeXml };
