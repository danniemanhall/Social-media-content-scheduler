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
   - **Reel requests:** also make the shot list a clear running order with rough seconds per shot, for example "0–3 s: close-up of rope coil".
   - **Can't do it:** for example, it needs a claim we can't make, or it needs media you can't see. Say so in `claude.note` and change nothing.
5. Save the slot by the rules in `README.md`. Set `askClaude` to false, and fill `claude` with `at`, `note` and `previous`. Keep the person's `notes` as they are.
6. Finish with the summary.
