# Launch strategy — Chatterbox

## Target communities

- **r/selfhosted** — this is the home crowd. Lead with the Disqus-import demo (dry-run → commit → idempotent) — self-hosters specifically care about migration friction and data ownership. Be upfront it's a paid convenience installer with a free MIT source option; r/selfhosted tolerates "source is free, packaged version is paid" framing well as long as the free path is real and undiminished.
- **r/blogging** — angle: "Disqus put ads on my blog and sold my readers' data." Bloggers are the most price-sensitive to the "why does a comment box cost $95/mo" framing.
- **r/webdev** — technical angle: shadow-DOM isolation, Wilson-score "best" sort, honeypot + rate-limit spam defenses, single-process Express + better-sqlite3 architecture. Show the code.
- **Indie Hackers** — "I built a one-time-purchase alternative to a SaaS I was paying for" is a proven IH post format. Include real MRR-avoided math ($8–95/mo × 36 months vs. $24 once).
- **Hugo / Jekyll / Astro / Eleventy forums & Discords** — static-site generators have zero built-in comment story; this is the single best-fit ICP since they cannot easily run "just a database column" — they need an actual hosted API, which Chatterbox's $5 VPS docker-compose covers.

## Show HN draft

**Title:** Show HN: Chatterbox – self-hosted threaded comments, $24 once (Disqus import included)

**Body:**
I got tired of Disqus running ads next to my writing and Hyvor Talk asking for $8–24/month for something this small in scope, so I built Chatterbox: a self-hosted comment widget — threaded replies (depth 4, collapsible), up/down votes with Wilson-score ranking, a moderation dashboard, honeypot + rate-limit + link-count spam defenses, reply-email notifications over your own SMTP, and a Disqus XML importer that's dry-run-first and idempotent (re-running it never double-imports).

It's one Express + better-sqlite3 process, one script tag on your site, and your data lives in a single SQLite file you can back up by copying one file. Source is MIT on GitHub; there's also a packaged one-time-purchase installer for people who'd rather skip `npm install`.

Feedback especially welcome on the spam-defense tuning and the Disqus import mapping — happy to add a wp:comment-meta importer too if XenForo/WordPress-native exports come up.

## SEO keywords (10)

1. disqus alternative self hosted
2. hyvor talk alternative
3. embeddable comment widget
4. comments for static site
5. blog comment system one time purchase
6. disqus import tool
7. self hosted comments sqlite
8. commento alternative
9. privacy friendly comments
10. add comments to website script

## AppSumo / PitchGround pitch paragraph

Chatterbox is a self-hosted, embeddable comment system — the open-source, one-time-purchase answer to Disqus and Hyvor Talk. One script tag adds threaded comments with voting, a real moderation dashboard, spam defenses, reply-email notifications over the customer's own SMTP, and a Disqus-XML importer that's dry-run-first and idempotent. It runs as a single Node process against one SQLite file (easy to demo, easy to self-host, easy to back up), ships a desktop app for local moderation and a Docker Compose file for a $5 VPS. Perfect for the AppSumo audience of bloggers, indie SaaS builders, and agencies migrating client sites off Disqus's ad-supported free tier.

## Suggested one-time price

**$24 one-time.** Competitor monthly math: Hyvor Talk Starter is $8/mo (annual) climbing to $24+/mo for larger tiers; Disqus's ad-free Plus tier is $12/mo (Pro $95/mo); Commento hosted is $10/mo; FastComments is $14.99/mo. At the low end ($8/mo Hyvor Starter), Chatterbox **pays for itself in 3 months** and is free forever after that. Against Disqus Plus ($12/mo) it pays for itself in exactly 2 months. Over 3 years that's $24 vs. $288–$3,420 depending on competitor/tier.
