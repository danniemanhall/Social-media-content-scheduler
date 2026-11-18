# Roopip Content Calendar

One place for Roopip's Instagram and Facebook: every week is already planned with brand-aligned ideas, and you drop in the photos and videos.

**Default week:** 1 reel, 2 grid posts (a carousel and a single image, alternating days), and 3 story days, with an optional Sunday story.

All four phases of the [plan](https://claude.ai/artifact/DEFeCBCvXBPbexWFkp5Fqk) are built: the pre-filled calendar, Claude writing ideas and captions on a schedule, the reel editor, and auto-posting to Instagram and Facebook. It runs entirely on free tiers.

## What's in it

| Screen | What it does |
| --- | --- |
| **Overview** | The next 4 weeks at a glance, colour-coded by format, with counts of what needs media or approval and an Instagram grid preview (newest top-left). |
| **Calendar** | Month and week views. Drag posts between days, add a post with **+** on any day. |
| **Post slot** | Opens from any tile: the idea, shot list, caption, CTA and hashtags (with Instagram's limits), date and time, status, music choice for reels, "Ask Claude" flag, notes. Drop in photos and videos, or choose them from Drive. Each file is checked for the right shape (9:16 for reels and stories, 4:5 for the grid). **Give me another idea** swaps the idea and keeps your media; **Lock** stops it from changing. |
| **Media** | Browses the media folders. **Scan folders** lists every photo and clip in them and reads each one's colours, so posts can suggest media and flag off-brand files. |
| **Brand & ideas** | The brand profile (palette, fonts, voice, pillars, approved claims), the media folders (add any Drive folder by link), and the searchable idea bank. |

### Media suggestions and brand checks

- `src/lib/brandFit.ts` scores each photo's colours and light against the Roopip palette and photo direction (warm, natural, soft, neutral), and compares grid posts with the three grid posts either side so the grid stays even.
- Every post shows **Suggested for this post**: on-brand files whose folder or file names match the post's product and pillar, preferring ones not used in the last three weeks. Each file on a post gets a brand-fit note with plain reasons when it's off.
- Fonts and on-image text can't be read from pixels, so Claude's scheduled run also does a **brand check** on upcoming posts' media and leaves notes on the post.
- Google Photos albums can't be linked: since 2025 Google only lets apps read photos they uploaded themselves. Keep shoots in Drive folders.

### Canva

Each post has **New design at the right size** buttons (story 1080 × 1920, grid post 1080 × 1350, reel 1080 × 1920) that open a blank Canva design. Paste a design's link and pick a size, and Claude's next scheduled run exports it through the Canva connector. **Add to post** then saves the files to the *Roopip Canva designs* folder in Drive and attaches them. The design must be in, or shared with, the Canva account connected to the Claude project.

### How the calendar fills itself

- `src/lib/ideas.ts` holds the idea bank (56 ideas across reels, carousels, posts and stories), written from the October 2026 plan and the product master sheet. Seasonal ideas (festive, winter, summer, Heritage Day, Mother's Day) only appear in their months.
- `src/lib/planner.ts` plans each upcoming week the first time anyone opens it, then saves it so it never changes under you. Rules: at least 3 content pillars a week, no idea twice in a week, no idea repeated within 8 weeks while fresh ones remain, no product featured in two product posts in a row, and grid layouts alternate days week to week.
- Claude's monthly run (the 22nd) plans next month, rewrites its captions for the dates, and adds new ideas to the bank. Claude's ideas are marked in **Brand & ideas**.
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

### Ask Claude

Tick **Ask Claude to help with this one** on any post and say what you want in its notes (or leave them empty for a fresh caption). Claude checks about 7 AM, 12 PM and 8 PM, makes the change, and leaves a note on the post with an **Undo** button. The instructions those runs follow are in [`claude-runs/`](claude-runs/README.md).

### Reel editor

Every reel has a **Reel editor** in its post drawer.
1. Add clips and photos.
2. Click **Build a storyboard** for a first cut, or tick *Ask Claude* and Claude plans the cut on its next run, after looking at frames from Drive clips.
3. Adjust each shot's start, length, speed and on-screen words, reorder or drop shots, and toggle the Roopip end card and warm colour grade.
4. **Render reel** builds a 1080 x 1920 MP4 in the browser with ffmpeg.wasm. You get cuts, slow motion, slow push-ins on photos, the warm grade, on-screen words in Cormorant Garamond, the end card, and a royalty-free track you choose when the post's music is set to royalty-free.
5. **Save to Drive and send for approval** puts the reel in a *Roopip reels* folder in your Drive and moves the post to *Ready for approval*.

The ffmpeg core (32 MB) is too big for Cloudflare Pages, so it loads from jsDelivr on the first render and is cached after that. Fonts are in `public/fonts` (SIL Open Font License).

### Auto-posting

Approved posts get a **Schedule for …** button. It hands the post's files to an R2 outbox. The `roopip-publisher` Worker (`publisher/`) runs every 15 minutes and posts what's due through the Meta Graph API:
- Photos and carousels go to Instagram and the Facebook Page.
- Reels go to Instagram as reels and to Facebook as a video.
- Stories go to Instagram only.

The post then moves to *Posted*, with a link. Reels set to *Instagram music* are never auto-posted. One-time setup: [docs/meta-setup.md](docs/meta-setup.md).

Deploying the publisher: `npm run publisher:build`, then `npx wrangler deploy -c publisher/wrangler.toml`. It is also deployed through the Cloudflare API.
