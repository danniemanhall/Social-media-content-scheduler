# Ask Claude run

This run handles three kinds of request, in this order. All three count as requests, so check all three before deciding there's nothing to do:

1. **Canva exports** that people asked for on a post (below, "Canva exports").
2. **Ask Claude requests:** people tick **Ask Claude to help with this one** on a slot and say what they want in its notes. Answer every such request (steps 1 to 6 just below).
3. **Brand checks** on media added to upcoming posts (below, "Brand checks").

If none of the three has anything to do, stop and say "No requests."

1. Read `README.md` and `voice.md` in this folder.
2. Find requests:

   ```sql
   SELECT id, updated_at, data FROM slots WHERE json_extract(data, '$.askClaude') = 1 ORDER BY date
   ```

   If there are none, go on to the brand checks.
3. Read the product master sheet once if any request involves a product.
4. For each slot, read `notes` and do what it asks, within the rules.
   - **No notes:** rewrite the caption, hashtags and call to action so they fit this slot's idea, product and date.
   - **Asks for a different idea:** you may change `title`, `prompt` and `shots` too. Keep the same `format` and `pillar` unless the note asks otherwise.
   - **Asks a question:** answer it in `claude.note`, and change fields only if the question calls for it.
   - **Reel with no media yet:** also make the shot list a clear running order with rough seconds per shot, for example "0–3 s: close-up of rope coil".
   - **Reel with media, or a note asking for a cut, edit or storyboard:** plan the edit in `storyboard` (see "Planning a reel" below). Don't render. People render in the app with one click.
   - **Can't do it:** for example, it needs a claim we can't make, or it needs media you can't see. Say so in `claude.note` and change nothing.
5. Save the slot by the rules in `README.md`. Set `askClaude` to false, and fill `claude` with `at`, `note` and `previous`. Keep the person's `notes` as they are.
6. Finish with the summary.

## Planning a reel

The slot's `media` lists its clips and photos. Their `durationSec`, `width` and `height` may be set.

1. **Look at the material.** For media with `source: "drive"`, download it with the Google Drive connector (`download_file_content`).
   - For a video, pull a frame every second with the container's `ffmpeg`, for example `ffmpeg -i clip.mp4 -vf fps=1,scale=360:-1 f%02d.jpg`, and look at the frames.
   - For a photo, look at it directly.
   - Media with `source: "local"` lives only on someone's device. Plan it from its name and `durationSec`, and say so in the note.
2. **Write a `storyboard`** (type `Storyboard` in `src/lib/types.ts`): `{ shots, endCard: true, endText, grade: "warm", by: "claude" }`.
   - Each shot is `{ mediaId, start, duration, speed, text? }`. `start` is seconds into the source clip, `duration` is seconds in the finished reel, and `speed` is 1 for normal or 0.5 to 0.75 for slow motion. The clip must hold `start + duration × speed` seconds.
   - Aim for 15 to 25 seconds before the end card, and 1.5 to 4 seconds a shot. Open on the strongest texture or hands shot. Use slow motion once or twice on the most tactile moment. Skip shaky, blurry or badly lit seconds.
   - Use on-screen words on 1 to 3 shots, each at most 6 words, for example "Handmade, one piece at a time". Keep them in the brand voice.
   - `endText` defaults to "Handmade in Knysna".
3. **Explain the cut** in one or two sentences in `claude.note`. If the slot already had a storyboard, put it in `previous.storyboard`.

## Canva exports

People paste a Canva link on a post and pick a size. Do these first; someone is waiting on them.

1. Find them:

   ```sql
   SELECT id, updated_at, data FROM slots WHERE json_extract(data, '$.canva.status') = 'requested' ORDER BY date
   ```

2. For each one, read `data.canva` (`CanvaRequest` in `src/lib/types.ts`): `link` and `size`.
   - Get the design id: it's the part starting with `D` after `/design/` in a `canva.com` link. For a `canva.link/...` short link, use the Canva connector's `resolve-shortlink` first.
   - Check the design with `get-export-formats`.
   - Sizes are fixed: `story` is 1080 × 1920 JPG, `grid` is 1080 × 1350 JPG, `reel` is MP4 at `vertical_1080p`.
   - **Check the shape first.** The design's width ÷ height must be within 2% of the size's (0.5625 for story and reel, 0.8 for grid). If it isn't, don't export, because it would stretch. Set `status: "failed"` with an `error` like "The design is square, not 4:5. In Canva, click Resize, choose 1080 × 1350 px, then click Fetch again."
3. Export with `export-design`:
   - **story or grid:** `{ type: "jpg", quality: 92, width: 1080, height: <1920 or 1350> }`, all pages. Each page becomes one image, so a multi-page design makes a carousel.
   - **reel:** `{ type: "mp4", quality: "vertical_1080p" }`.
4. Save the slot by the rules in `README.md`, changing only `canva`: `{ ...canva, status: "exported", files: [{ url, type: "image" | "video" }, ...], exportedAt, error: undefined }`. Keep the pages in order. The links work for about a day. The app copies the files into Drive when someone clicks **Add to post**.
5. If the design can't be found or opened, it's probably in a different Canva account than the one connected to this project. Set `status: "failed"` and `error: "Claude can't open this design. Share it with the Canva account connected to Claude, or move it into that team, then click Fetch again."`
6. These may be on approved posts too. Changing only `canva` there is fine.

## Brand checks

The app checks colours and light itself. You check what it can't see: fonts, on-image text, logo use, and whether the image tells the post's story. Check up to 6 posts a run.

1. Find posts in the next 21 days with media that hasn't been checked, or whose media changed since the last check:

   ```sql
   SELECT id, updated_at, data FROM slots
   WHERE date BETWEEN date('now') AND date('now', '+21 days')
     AND json_extract(data, '$.status') IN ('media', 'editing', 'review')
     AND json_array_length(json_extract(data, '$.media')) > 0
   ORDER BY date
   ```

   Skip a slot when `brandCheck.mediaIds` already equals the ids in `media`, in order.
2. Look at each image. For `source: "drive"`, use the Google Drive connector (`download_file_content`). For videos, pull 3 frames with `ffmpeg`. Skip `source: "local"` files, and say so in the notes.
3. Check them against `src/lib/brand.ts`:
   - **Fonts:** any text should be Cormorant Garamond (headings) or DM Sans (body). Flag script, rounded, bold display or default fonts like Arial or Canva Sans.
   - **Text colour:** text should be in the palette, mostly Deep Espresso on light, or Warm Ivory on dark.
   - **Colour and light:** warm, natural and soft, with neutral styling. Flag bright props, coloured backgrounds, filters, harsh flash or cool light.
   - **Logo:** the Roopip wordmark, if any, should be small and unstretched, in Espresso or Ivory.
   - **Fit:** the media should suit the post's title, product and pillar.
   - **Grid:** for grid posts, compare with the three grid posts before it and after it, and flag one that will look out of step.
4. Save only `brandCheck`: `{ at, ok, notes, mediaIds }`. `ok` is true when nothing needs changing. Each note is one plain sentence naming the file, for example "IMG_2041: the headline is in a script font; use Cormorant Garamond." `mediaIds` holds the ids you checked, in order.
