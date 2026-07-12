# Chatterbox 💬

**Self-hosted embeddable threaded comments. Pay once, own it forever.**

[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg)](LICENSE)

Disqus puts ads next to your writing and sells your readers' data unless you pay $12–95/month. Hyvor Talk is ad-free but still $8–24+/month, forever. Chatterbox is the same idea — one `<script>` tag adds threaded comments, votes, moderation, and reply-email notifications to any site — running on **your** server, with **your** SQLite file, for a **one-time** price of **$24**.

![Screenshot](docs/screenshot.png)

## Features

- **One-line embed** — `<script src="https://your-host/embed.js" data-page-id="my-post" defer></script>` + `<div id="chatterbox"></div>`. Dependency-free vanilla JS in a shadow DOM — your site's styles never leak in, the widget's never leak out.
- **Threaded comments** — replies nested to depth 4 with collapse, relative timestamps, a 15-minute self-edit/delete window for commenters.
- **Voting** — one vote per browser token per comment (server-enforced upsert), sort by Best (Wilson score), Newest, or Oldest.
- **Moderation dashboard** — Pending/Approved/Spam/Deleted queue tabs, bulk actions, per-site approve-first toggle, email/IP blocklist.
- **Spam defenses that don't annoy humans** — hidden honeypot field, minimum time-to-submit, per-IP rate limiting (5/10min by default), a link-count threshold — all invisible unless you're a bot.
- **Reply-email notifications** — bring your own SMTP; commenters who opt in get emailed on replies, with a signed one-click unsubscribe link. Every send attempt is logged.
- **Disqus import** — upload your XML export, dry-run the counts, commit, done. Re-importing the same file is a no-op (idempotent by `disqus_id`).
- **RSS feed** of the latest approved comments site-wide, for moderating from any feed reader.
- **Privacy-first** — IP addresses are salted-hashed before they ever touch disk. Never stored raw.
- **XSS-safe by construction** — comment bodies are only ever rendered as text nodes; autolinked URLs are built as real `<a rel="nofollow noopener ugc">` elements, never string-concatenated HTML.

## Quick start

```bash
npm i
npm run build   # builds the admin UI
npm start       # http://localhost:5340/admin  (password: admin)
```

Copy the embed snippet from the Embed tab, paste it into any page. Done.

### Run it as a desktop app…

```bash
npm run desktop
```

Same product, zero setup — the Electron shell boots the server on a random local port, stores data in your user profile, and logs you in automatically. (`npm run dist` packages a Windows installer.) Great for local moderation; the embed itself still needs a public VPS.

### …or deploy to a $5 VPS when you need it public

```bash
docker compose up -d
```

Set `ADMIN_PASSWORD` and `BASE_URL` via environment — see [`.env.example`](.env.example). The SQLite database lives in a Docker volume; back up one file and you've backed up everything.

## Chatterbox vs. the subscription crowd

|  | **Chatterbox** | Hyvor Talk | Disqus |
|---|---|---|---|
| Price | **$24 once** | $8–24+/mo | Free (ads) / Plus $12/mo / Pro $95/mo |
| Cost over 3 years | **$24** | $288–$864+ | $432–$3,420 |
| Threaded comments + voting | ✅ | ✅ | ✅ |
| Moderation dashboard | ✅ | ✅ | ✅ |
| Disqus import (dry-run, idempotent) | ✅ | Partial | — |
| Reply-email notifications | ✅ (your SMTP) | ✅ | ✅ |
| Ads on your site | **Never** | Never | Free tier only |
| Your data on your server | ✅ | ❌ | ❌ |
| IP addresses hashed, not stored raw | ✅ | ❌ (unclear) | ❌ |
| Source code | MIT, yours | ❌ | ❌ |

## ☕ Skip the setup — get the 1-click installer

Want the packaged desktop installer and future updates without touching a terminal? Grab the one-time convenience version: **[whop.com/onetime-suite](https://whop.com/benjisaiempire/chatterbox-app)** — pay once, own it forever, no subscription.

## Tech stack

- **Server** — Node 20+, Express, better-sqlite3 (WAL). One process serves the API, the embed script, and the built admin UI.
- **Admin** — React 18, Vite, Tailwind CSS 4, Framer Motion, Lucide icons.
- **Widget** — dependency-free vanilla JS (~15 KB raw), shadow DOM, text-node rendering only.
- **Import** — fast-xml-parser for Disqus WXR-style XML exports.
- **Email** — nodemailer over BYO SMTP; off by default, no-ops safely when unconfigured.
- **Desktop mode** — thin Electron wrapper around the identical server code.
- **Tests** — `npm test` boots the real server (plus a real local mock SMTP server) and runs an end-to-end suite: comments, threading, honeypot, rate limiting, vote upsert, reply notifications, moderation visibility, Disqus import, RSS, and an XSS check.

## Configuration

| Env var | Default | What it does |
|---|---|---|
| `PORT` | `5340` | Server port |
| `ADMIN_PASSWORD` | `admin` | Admin panel password |
| `DATA_DIR` | `./data` | Where `app.db` lives |
| `BASE_URL` | — | Public origin, used in unsubscribe links + RSS |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | — | BYO SMTP for reply notifications (also configurable in Settings) |

## API overview

Public/widget (CORS-enabled, no auth): `GET /embed.js`, `GET /api/widget/comments`, `POST /api/widget/comments`, `PUT|DELETE /api/widget/comments/:id`, `POST /api/widget/comments/:id/vote`, `GET /unsubscribe/:token`, `GET /rss.xml`.

Admin (session auth): `POST /api/login|logout`, `GET /api/health`, `GET /api/comments`, `POST /api/comments/:id/approve|spam|delete`, `POST /api/comments/bulk`, `GET /api/pages`, `POST /api/pages/:id/lock`, `GET|POST|DELETE /api/blocks`, `GET|PUT /api/settings`, `POST /api/settings/test-email`, `POST /api/import/disqus`, `GET /api/import/status`.

## License

[MIT](LICENSE) — © 2026 Ben ([bensblueprints](https://github.com/bensblueprints))
