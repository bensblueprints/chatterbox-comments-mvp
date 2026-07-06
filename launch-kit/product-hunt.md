# Product Hunt launch kit — Chatterbox

**Name:** Chatterbox

**Tagline (60 chars):**
Self-hosted comments you own forever — import Disqus in 1 click

**Short description (260 chars):**
Chatterbox is a self-hosted threaded comment widget: one script tag, votes, moderation, reply-email notifications, and a real Disqus importer. No ads, no tracking, no monthly bill — your comments live in one SQLite file you control forever.

**Full description:**

Every "just add comments" tool now wants a subscription. Disqus puts ads on your blog and sells your readers' data unless you pay $12–95/mo. Hyvor Talk is ad-free but still $8–24+/mo forever. Commento and FastComments are $10–15/mo. If you run a static site (Hugo, Jekyll, Astro, Eleventy) you don't have a backend of your own — you're stuck paying rent for a comment box.

Chatterbox is the alternative: a single `<script>` tag that renders a full threaded comment system — composer, nested replies to depth 4 with collapse, up/down votes with Wilson-score "best" sorting, dark-mode-aware shadow-DOM styling that never leaks into your page — backed by one Express + SQLite process you run yourself, once, for **$24 total**.

What's inside:
- **Threaded comments** with reply nesting, relative timestamps, and a 15-minute self-edit/delete window for commenters.
- **Voting** — one vote per browser per comment (server-enforced), Best/Newest/Oldest sort.
- **Moderation dashboard** — pending/approved/spam/deleted queue tabs, bulk actions, per-site approve-first toggle, IP/email blocklist.
- **Spam defenses that actually work** — honeypot field, minimum time-to-submit, per-IP rate limiting, link-count threshold — all invisible to real commenters.
- **Reply-email notifications** over your own SMTP (SES, Postmark, Gmail — whatever you already have), with a one-click signed unsubscribe link.
- **Disqus import** — upload your XML export, dry-run the counts, commit, and it's idempotent: run it twice and nothing double-imports.
- **RSS feed of new comments** so you can moderate from any feed reader.
- **Privacy-first** — IP addresses are hashed with a salt before they ever touch disk. Never stored raw.
- **Desktop mode** for local moderation, or a Docker Compose file for a $5 VPS.

**Maker's first comment:**
Hey Product Hunt 👋 — I built Chatterbox because I got tired of watching Disqus put slot-machine ads next to my blog posts and quietly pay itself with my readers' data. I looked at Hyvor Talk as the "nice" alternative, but $8/mo forever for a comment box felt wrong for something this small in scope. So I wrote my own: one SQLite file, one Node process, a shadow-DOM widget that's under 20KB, and a Disqus importer so switching costs nothing. It's MIT-licensed on GitHub if you want to run it yourself for free, or grab the packaged installer on Whop if you'd rather skip the setup. Would love feedback from anyone running a static site — that's who I built this for.

**Gallery shot list (5):**
1. The embed widget live on a blog post — composer + threaded replies + vote arrows, dark mode.
2. The moderation queue with Pending/Approved/Spam/Deleted tabs and a bulk-action bar.
3. The Disqus import screen mid dry-run, showing the counts preview before commit.
4. Settings screen — approve-first toggle, allowed origins, BYO-SMTP fields with "Send test" button.
5. Side-by-side pricing graphic: Chatterbox $24 once vs. Hyvor Talk / Disqus Plus monthly cost over 12 months.
