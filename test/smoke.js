// End-to-end smoke test: boots the real server via createApp() on an ephemeral
// port with a throwaway data dir, then exercises the full flow a real install
// would see — health/auth, embed.js delivery, comment posting + auto-approve,
// reply nesting, honeypot, rate limiting, vote upsert, reply-email notification
// (against a real local mock SMTP server), approve-first moderation visibility,
// Disqus XML import (dry-run + commit + idempotent re-import), RSS, and an XSS check.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SMTPServer } = require('smtp-server');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatterbox-smoke-'));
process.env.ADMIN_PASSWORD = 'smoke-pass';
const { createApp } = require('../server/app.js');

const app = createApp({ dataDir, adminPassword: 'smoke-pass' });

let cookie = '';
let base = '';
let listener = null;
let smtpServer = null;

async function call(method, url, body, opts = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.auth === false ? {} : { Cookie: cookie }),
      ...(opts.headers || {})
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

function widgetBody(extra) {
  return { hp: '', elapsed_ms: 5000, ...extra };
}

let passed = 0;
function ok(name) { passed++; console.log('  ✓ ' + name); }

function buildDisqusFixture() {
  // 2 threads, 3 posts, one nested reply (post 5002 replies to 5001).
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dsq="http://www.disqus.com/embed/comments/rss/1.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<thread dsq:id="1001"><id>1001</id><link>https://blog.example.com/post-one</link><title>Post One</title></thread>
<thread dsq:id="1002"><id>1002</id><link>https://blog.example.com/post-two</link><title>Post Two</title></thread>
<post dsq:id="5001">
  <id>5001</id>
  <message><![CDATA[<p>First comment on post one</p>]]></message>
  <createdAt>2024-01-01T10:00:00Z</createdAt>
  <author><name>Alice</name><email>alice@example.com</email></author>
  <thread dsq:id="1001"/>
  <isDeleted>false</isDeleted>
  <isSpam>false</isSpam>
</post>
<post dsq:id="5002">
  <id>5002</id>
  <message><![CDATA[<p>Reply to Alice</p>]]></message>
  <createdAt>2024-01-01T11:00:00Z</createdAt>
  <author><name>Bob</name><email>bob@example.com</email></author>
  <thread dsq:id="1001"/>
  <parent dsq:id="5001"><id>5001</id></parent>
  <isDeleted>false</isDeleted>
  <isSpam>false</isSpam>
</post>
<post dsq:id="5003">
  <id>5003</id>
  <message><![CDATA[<p>Comment on post two</p>]]></message>
  <createdAt>2024-01-02T09:00:00Z</createdAt>
  <author><name>Carol</name><email>carol@example.com</email></author>
  <thread dsq:id="1002"/>
  <isDeleted>false</isDeleted>
  <isSpam>false</isSpam>
</post>
</channel>
</rss>`;
}

async function multipartUpload(url, filename, content, extraQuery = '') {
  const boundary = '----chatterboxSmoke' + Date.now();
  const body =
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/xml\r\n\r\n` +
    content + `\r\n--${boundary}--\r\n`;
  const res = await fetch(base + url + extraQuery, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, Cookie: cookie },
    body
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

async function main() {
  listener = await new Promise((resolve) => {
    const l = app.listen(0, '127.0.0.1', () => resolve(l));
  });
  base = `http://127.0.0.1:${listener.address().port}`;
  console.log('Smoke test against ' + base);

  // ---- 1. health / auth / login ----
  let r = await call('GET', '/api/health', null, { auth: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.ok, true);

  r = await call('GET', '/api/comments');
  assert.strictEqual(r.status, 401);

  r = await call('POST', '/api/login', { password: 'wrong' });
  assert.strictEqual(r.status, 401);

  const loginRes = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'smoke-pass' })
  });
  assert.strictEqual(loginRes.status, 200);
  cookie = loginRes.headers.get('set-cookie').split(';')[0];
  ok('health check, admin API rejects unauthenticated requests, login works');

  // ---- 2. embed.js content-type ----
  r = await call('GET', '/embed.js', null, { auth: false });
  assert.strictEqual(r.status, 200);
  assert.ok(r.headers.get('content-type').includes('javascript'));
  assert.ok(r.text.includes('attachShadow'), 'widget uses shadow DOM');
  ok('GET /embed.js serves widget JS with correct content-type');

  // ---- 3. comment POST + approve-first-OFF auto-approve + GET returns it ----
  const PAGE = 'https://customer.example/blog/post-1';
  r = await call('POST', '/api/widget/comments', widgetBody({
    page_key: PAGE, name: 'Fan', email: 'fan@example.com', body: 'Great write-up, thanks!'
  }), { auth: false, headers: { 'x-forwarded-for': 'ip-1', 'x-chatterbox-token': 'token-fan' } });
  assert.strictEqual(r.status, 201);
  const commentAId = r.json.id;

  r = await call('GET', `/api/widget/comments?page_key=${encodeURIComponent(PAGE)}`, null, { auth: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.comments.length, 1);
  assert.strictEqual(r.json.comments[0].id, commentAId);
  assert.strictEqual(r.json.comments[0].status, 'approved');
  ok('comment POST auto-approves with approve-first OFF, GET returns it');

  // ---- 4. reply nesting ----
  r = await call('POST', '/api/widget/comments', widgetBody({
    page_key: PAGE, parent_id: commentAId, name: 'Replier', body: 'I agree completely.'
  }), { auth: false, headers: { 'x-forwarded-for': 'ip-1', 'x-chatterbox-token': 'token-replier' } });
  assert.strictEqual(r.status, 201);
  const replyId = r.json.id;

  r = await call('GET', `/api/widget/comments?page_key=${encodeURIComponent(PAGE)}`, null, { auth: false });
  assert.strictEqual(r.json.comments.length, 1);
  assert.strictEqual(r.json.comments[0].replies.length, 1);
  assert.strictEqual(r.json.comments[0].replies[0].id, replyId);
  ok('reply nests under parent in response tree shape');

  // ---- 5. honeypot ----
  r = await call('POST', '/api/widget/comments', {
    page_key: PAGE, name: 'Bot', body: 'BUY CHEAP PILLS', hp: 'http://spam.example', elapsed_ms: 1
  }, { auth: false, headers: { 'x-forwarded-for': 'ip-2' } });
  assert.strictEqual(r.status, 201, 'honeypot response looks like a normal success');
  const spamId = r.json.id;
  const spamRow = app._db.prepare('SELECT status FROM comments WHERE id = ?').get(spamId);
  assert.strictEqual(spamRow.status, 'spam', 'honeypot submission stored as spam');
  r = await call('GET', `/api/widget/comments?page_key=${encodeURIComponent(PAGE)}`, null, { auth: false });
  assert.ok(!r.json.comments.some((c) => c.body.includes('PILLS')), 'spam absent from widget GET');
  ok('honeypot: 200-shaped response, stored as spam, hidden from widget GET');

  // ---- 6. rate limit ----
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const rr = await call('POST', '/api/widget/comments', widgetBody({
      page_key: PAGE, name: 'Flooder', body: 'flood message ' + i
    }), { auth: false, headers: { 'x-forwarded-for': 'ip-flood', 'x-chatterbox-token': 'token-flood' } });
    if (rr.status === 429) { got429 = true; break; }
  }
  assert.ok(got429, 'rate limiter fires within default 5/10min budget');
  ok('rate limit: rapid posts from same IP eventually get 429');

  // ---- 7. vote upsert ----
  r = await call('POST', `/api/widget/comments/${commentAId}/vote`, { value: 1 }, {
    auth: false, headers: { 'x-chatterbox-token': 'voter-1' }
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.score, 1);
  r = await call('POST', `/api/widget/comments/${commentAId}/vote`, { value: 1 }, {
    auth: false, headers: { 'x-chatterbox-token': 'voter-1' }
  });
  assert.strictEqual(r.json.score, 1);
  const voteCount = app._db.prepare('SELECT COUNT(*) AS n FROM votes WHERE comment_id = ?').get(commentAId).n;
  assert.strictEqual(voteCount, 1, 'same voter token still produces exactly 1 vote row');
  ok('vote upsert: same token voting twice stays at 1 row / score 1');

  // ---- 8. reply notification via real local mock SMTP ----
  smtpServer = new SMTPServer({
    secure: false,
    disabledCommands: ['AUTH', 'STARTTLS'],
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', (d) => chunks.push(d));
      stream.on('end', () => {
        smtpServer.__messages.push({ envelope: session.envelope, raw: Buffer.concat(chunks).toString('utf8') });
        callback();
      });
    }
  });
  smtpServer.__messages = [];
  const smtpPort = await new Promise((resolve) => {
    smtpServer.listen(0, '127.0.0.1', () => resolve(smtpServer.server.address().port));
  });

  r = await call('PUT', '/api/settings', {
    smtp_enabled: '1', smtp_host: '127.0.0.1', smtp_port: String(smtpPort), smtp_secure: '0',
    smtp_from: 'chatterbox@test.local'
  });
  assert.strictEqual(r.status, 200);

  const NOTIFY_PAGE = 'https://customer.example/blog/notify-post';
  r = await call('POST', '/api/widget/comments', widgetBody({
    page_key: NOTIFY_PAGE, name: 'OriginalAuthor', email: 'original@example.com', body: 'Original comment worth replying to.', notify: true
  }), { auth: false, headers: { 'x-forwarded-for': 'ip-notify', 'x-chatterbox-token': 'token-original' } });
  assert.strictEqual(r.status, 201);
  const parentCommentId = r.json.id;

  const REPLY_EXCERPT = 'Thanks for sharing that unique insight ABC123';
  r = await call('POST', '/api/widget/comments', widgetBody({
    page_key: NOTIFY_PAGE, parent_id: parentCommentId, name: 'ReplyGuy', body: REPLY_EXCERPT
  }), { auth: false, headers: { 'x-forwarded-for': 'ip-notify', 'x-chatterbox-token': 'token-replyguy' } });
  assert.strictEqual(r.status, 201);
  const replyCommentId = r.json.id;

  assert.strictEqual(smtpServer.__messages.length, 1, 'mock SMTP received exactly one message');
  assert.strictEqual(smtpServer.__messages[0].envelope.rcptTo[0].address, 'original@example.com');
  // undo quoted-printable soft line breaks (=\r\n) before matching — nodemailer
  // wraps long lines at 76 chars, which can split the excerpt mid-string
  const decodedRaw = smtpServer.__messages[0].raw.replace(/=\r?\n/g, '');
  assert.ok(decodedRaw.includes(REPLY_EXCERPT), 'email body contains the reply excerpt');

  const logRow = app._db.prepare('SELECT * FROM notification_log WHERE comment_id = ?').get(replyCommentId);
  assert.ok(logRow, 'notification_log row was written');
  assert.strictEqual(logRow.ok, 1, 'notification_log.ok = 1');
  ok('reply notification: real mock SMTP received the email, notification_log.ok=1');

  // turn SMTP back off so later tests don't depend on the mock server staying up
  await call('PUT', '/api/settings', { smtp_enabled: '0' });

  // ---- 9. approve-first ON: pending visibility ----
  r = await call('PUT', '/api/settings', { approve_first: '1' });
  assert.strictEqual(r.status, 200);

  const MOD_PAGE = 'https://customer.example/blog/moderated-post';
  r = await call('POST', '/api/widget/comments', widgetBody({
    page_key: MOD_PAGE, name: 'PendingAuthor', body: 'This should await moderation.'
  }), { auth: false, headers: { 'x-forwarded-for': 'ip-mod', 'x-chatterbox-token': 'token-author-pending' } });
  assert.strictEqual(r.status, 201);
  const pendingId = r.json.id;
  const pendingRow = app._db.prepare('SELECT status FROM comments WHERE id = ?').get(pendingId);
  assert.strictEqual(pendingRow.status, 'pending');

  r = await call('GET', `/api/widget/comments?page_key=${encodeURIComponent(MOD_PAGE)}`, null, {
    auth: false, headers: { 'x-chatterbox-token': 'token-someone-else' }
  });
  assert.strictEqual(r.json.comments.length, 0, 'pending comment hidden from a different token');

  r = await call('GET', `/api/widget/comments?page_key=${encodeURIComponent(MOD_PAGE)}`, null, {
    auth: false, headers: { 'x-chatterbox-token': 'token-author-pending' }
  });
  assert.strictEqual(r.json.comments.length, 1, 'pending comment visible to its own author token');
  assert.strictEqual(r.json.comments[0].pending, true);
  ok('approve-first ON: pending comment hidden from others, visible to its author');

  await call('PUT', '/api/settings', { approve_first: '0' });

  // ---- 10. Disqus import: dry-run, commit, idempotent re-import ----
  const xml = buildDisqusFixture();
  let ir = await multipartUpload('/api/import/disqus', 'export.xml', xml, '?dry_run=1');
  assert.strictEqual(ir.status, 200);
  assert.deepStrictEqual({ pages: ir.json.pages, comments: ir.json.comments }, { pages: 2, comments: 3 });
  const beforeCommentCount = app._db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;

  ir = await multipartUpload('/api/import/disqus', 'export.xml', xml);
  assert.strictEqual(ir.status, 200);
  assert.strictEqual(ir.json.pages, 2);
  assert.strictEqual(ir.json.comments, 3);
  const afterCommentCount = app._db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
  assert.strictEqual(afterCommentCount - beforeCommentCount, 3, 'commit actually wrote 3 new comment rows');

  const child = app._db.prepare(`SELECT * FROM comments WHERE disqus_id = '5002'`).get();
  const parent = app._db.prepare(`SELECT * FROM comments WHERE disqus_id = '5001'`).get();
  assert.ok(child && parent, 'imported rows exist');
  assert.strictEqual(child.parent_id, parent.id, 'parent linkage preserved on import');

  ir = await multipartUpload('/api/import/disqus', 'export.xml', xml);
  assert.strictEqual(ir.status, 200);
  assert.strictEqual(ir.json.comments, 0, 're-import creates 0 new comment rows (idempotent)');
  assert.strictEqual(ir.json.pages, 0, 're-import creates 0 new page rows (idempotent)');
  ok('Disqus import: dry-run counts correct, commit preserves parent linkage, re-import is idempotent');

  // ---- 11. RSS ----
  r = await call('GET', '/rss.xml', null, { auth: false });
  assert.strictEqual(r.status, 200);
  assert.ok(r.headers.get('content-type').includes('application/rss+xml'));
  assert.ok(r.text.includes('Great write-up, thanks'), 'RSS contains a latest comment excerpt');
  ok('GET /rss.xml returns 200, correct content-type, contains a comment excerpt');

  // ---- bonus: XSS ----
  const XSS_PAGE = 'https://customer.example/blog/xss-post';
  const XSS_PAYLOAD = '<script>window.__pwned = true;</script>';
  r = await call('POST', '/api/widget/comments', widgetBody({
    page_key: XSS_PAGE, name: 'Attacker', body: XSS_PAYLOAD
  }), { auth: false, headers: { 'x-forwarded-for': 'ip-xss', 'x-chatterbox-token': 'token-xss' } });
  assert.strictEqual(r.status, 201);
  r = await call('GET', `/api/widget/comments?page_key=${encodeURIComponent(XSS_PAGE)}`, null, { auth: false });
  assert.strictEqual(r.json.comments[0].body, XSS_PAYLOAD, 'server stores the raw text verbatim (escaping is a render-time concern)');
  // static check: the widget must only ever place comment bodies via text nodes, never innerHTML
  const EMBED_SOURCE = require('../server/embed-template.js');
  assert.ok(EMBED_SOURCE.includes('renderBodyText(bodyEl, c.body)'), 'widget routes comment bodies through the text-node renderer');
  assert.ok(!/innerHTML\s*=\s*c\.body/.test(EMBED_SOURCE), 'widget never assigns comment bodies to innerHTML');
  ok('XSS: <script> payload stored verbatim but widget only ever renders bodies as text nodes');

  listener.close();
  smtpServer.close();
  console.log(`\nAll ${passed} smoke checks passed.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('\nSMOKE TEST FAILED:', e); process.exit(1); })
  .finally(() => {
    try { if (listener) listener.close(); } catch {}
    try { if (smtpServer) smtpServer.close(); } catch {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });
