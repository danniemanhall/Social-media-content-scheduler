# Roopip Content Calendar

One place for Roopip's Instagram and Facebook: every week is already planned with brand-aligned ideas, and you drop in the photos and videos.

**Default week:** 1 reel, 2 grid posts (a carousel and a single image, alternating days), and 3 story days, with an optional Sunday story.

This is **Phase 1** of the [plan](https://claude.ai/artifact/DEFeCBCvXBPbexWFkp5Fqk): the pre-filled calendar. It runs entirely on free tiers.

## What's in it

| Screen | What it does |
| --- | --- |
| **Overview** | The next 4 weeks at a glance, colour-coded by format, with counts of what needs media or approval and an Instagram grid preview (newest top-left). |
| **Calendar** | Month and week views. Drag posts between days, add a post with **+** on any day. |
| **Post slot** | Opens from any tile: the idea, shot list, caption, CTA and hashtags (with Instagram's limits), date and time, status, music choice for reels, "Ask Claude" flag, notes. Drop in photos and videos, or choose them from Drive. Each file is checked for the right shape (9:16 for reels and stories, 4:5 for the grid). **Give me another idea** swaps the idea and keeps your media; **Lock** stops it from changing. |
| **Media** | Browses the Drive folders *Product Photos* and *Brand Assets*. |
| **Brand & ideas** | The brand profile (palette, fonts, voice, pillars, approved claims) and the searchable idea bank. |

### How the calendar fills itself

- `src/lib/ideas.ts` holds the idea bank (56 ideas across reels, carousels, posts and stories), written from the October 2026 plan and the product master sheet. Seasonal ideas (festive, winter, summer, Heritage Day, Mother's Day) only appear in their months.
- `src/lib/planner.ts` plans each upcoming week the first time anyone opens it, then saves it so it never changes under you. Rules: at least 3 content pillars a week, no idea twice in a week, no idea repeated within 8 weeks while fresh ones remain, no product featured in two product posts in a row, and grid layouts alternate days week to week.
- Status flow: Idea → Media added → Editing → Ready for approval → Approved → Scheduled → Posted. The social media manager moves posts to *Ready for approval*; Carli approves.

## Free hosting setup (one time, about 30 minutes)

Everything below is free. You need a Cloudflare account and a Google account that can see Roopip's Drive.

### 1. Put the app on Cloudflare Pages

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git** and pick this repository.
2. Build command: `npm run build`. Output directory: `dist`.

### 2. Create the shared database (Cloudflare D1)

```bash
npm install
npx wrangler login
npx wrangler d1 create roopip-calendar     # prints a database_id
# paste that id into wrangler.toml (database_id = "...")
npm run db:migrate:remote
```

Commit the `wrangler.toml` change. Pages picks up the `DB` binding from it on the next deploy. Until the database is connected the app still works, but shows **Saved on this device only**.

### 3. Lock it to Carli and the social media manager (Cloudflare Access)

1. In Cloudflare **Zero Trust** (free for up to 50 people) go to **Access → Applications → Add an application → Self-hosted**.
2. Domain: your Pages address (for example `roopip-content-calendar.pages.dev`).
3. Add a policy **Allow** with the two email addresses.
4. Login method: **One-time PIN** works with no extra setup (a code is emailed). Google login can be added later.

The app shows the signed-in email in the header.

### 4. Connect Google Drive (for the media library and "Choose from Drive")

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project and enable the **Google Drive API**.
2. **OAuth consent screen:** if roopip.co.za uses Google Workspace, choose *Internal*. Otherwise choose *External*, leave it in *Testing*, and add Carli's and the social media manager's Google accounts as test users.
3. **Credentials → Create credentials → OAuth client ID → Web application.** Under *Authorised JavaScript origins* add your Pages address (and `http://localhost:8788` for local testing).
4. In Cloudflare Pages → **Settings → Environment variables**, add `VITE_GOOGLE_CLIENT_ID` with the client ID, then redeploy.

The app only asks for read-only Drive access and never changes your files. Files dropped straight into a post (instead of picked from Drive) keep a small preview that everyone can see; the original stays on the device it came from, so the usual flow is: add new shoots to the Drive folders, then pick them.

## Local development

```bash
npm install
npm test                    # planner and media-check tests
npm run db:migrate:local
npm run preview             # full app with a local database at http://localhost:8788
npm run dev                 # UI only, saves to this browser
```

## Coming next

- **Phase 2:** Claude (through Daniel's Claude plan, on a schedule) fills next month's ideas and captions and answers posts marked *Ask Claude*.
- **Phase 3:** AI reel editing: shot picking, storyboard, rendering.
- **Phase 4:** Auto-posting approved posts to Instagram and Facebook (reels set to *Instagram music* stay manual).
