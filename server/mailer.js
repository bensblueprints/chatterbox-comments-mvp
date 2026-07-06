// BYO-SMTP email notifications. Only ever touches the network when the owner
// has explicitly configured and enabled their own SMTP server in Settings.
const nodemailer = require('nodemailer');

function buildTransport(settings) {
  if (settings.smtp_enabled !== '1' || !settings.smtp_host) return null;
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    secure: settings.smtp_secure === '1',
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_pass } : undefined
  });
}

function logNotification(db, { commentId, toEmail, kind, ok, error }) {
  db.prepare(
    `INSERT INTO notification_log (comment_id, to_email, kind, sent_at, ok, error)
     VALUES (?, ?, ?, datetime('now'), ?, ?)`
  ).run(commentId, toEmail, kind, ok ? 1 : 0, error || null);
}

// Sends a reply-notification email to the author of `parentComment` when someone
// replies to their comment. No-ops (with a console warning) if SMTP isn't configured —
// that is a valid, expected state and must never throw.
async function sendReplyNotification(db, settings, { parentComment, replyComment, page, unsubscribeUrl }) {
  const to = String(parentComment.author_email || '').trim();
  if (!to) return { skipped: true };

  const transport = buildTransport(settings);
  if (!transport) {
    console.warn('[mailer] SMTP not configured — skipping reply notification to', to);
    return { skipped: true };
  }

  const excerpt = String(replyComment.body || '').slice(0, 200);
  const subject = `New reply to your comment${page?.title ? ' on ' + page.title : ''}`;
  const text = [
    `${replyComment.author_name || 'Someone'} replied to your comment:`,
    '',
    excerpt,
    '',
    page?.url ? `View the discussion: ${page.url}` : null,
    page?.url ? '' : null,
    `Don't want these emails? Unsubscribe: ${unsubscribeUrl}`
  ].filter((l) => l !== null).join('\n');

  try {
    await transport.sendMail({ from: settings.smtp_from || settings.smtp_user, to, subject, text });
    logNotification(db, { commentId: replyComment.id, toEmail: to, kind: 'reply', ok: true });
    return { ok: true };
  } catch (e) {
    logNotification(db, { commentId: replyComment.id, toEmail: to, kind: 'reply', ok: false, error: e.message });
    console.warn('[mailer] reply notification failed:', e.message);
    return { ok: false, error: e.message };
  }
}

async function sendTest(settings, to) {
  const transport = buildTransport({ ...settings, smtp_enabled: '1' });
  if (!transport) throw new Error('SMTP host not configured');
  await transport.sendMail({
    from: settings.smtp_from || settings.smtp_user,
    to,
    subject: '[Chatterbox] SMTP test',
    text: 'Your Chatterbox SMTP settings work. Reply notifications will be sent from here.'
  });
}

module.exports = { sendReplyNotification, sendTest, buildTransport };
