# Ask Claude run

People tick **Ask Claude to help with this one** on a slot and say what they want in its notes. Answer every such request.

1. Read `README.md` and `voice.md` in this folder.
2. Find requests:

   ```sql
   SELECT id, updated_at, data FROM slots WHERE json_extract(data, '$.askClaude') = 1 ORDER BY date
   ```

   If there are none, stop and say "No requests."
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
