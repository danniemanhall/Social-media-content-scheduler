# Claude's scheduled runs

The calendar has no live AI. Scheduled Claude runs, on Daniel's Claude plan, read and write the shared calendar instead. Each run starts fresh with this repo checked out, follows one file here, and stops.

| Run | When (Johannesburg time) | Instructions |
| --- | --- | --- |
| Ask Claude | About 07:17, 12:17 and 20:17 every day | [ask-claude.md](ask-claude.md) |
| Monthly fill | The 22nd at about 20:23 | [monthly.md](monthly.md) |

Every run also follows the rules below and writes in the voice set out in [voice.md](voice.md).

## Reaching the data

The calendar lives in Cloudflare D1. Use the **Cloudflare connector** (`execute` tool) and its D1 query endpoint:

- Account: `658e053210bd073c77111bd72fca7d97`
- Database: `9fe1bca5-d54d-4e43-bf03-262cbb32a9b0` (`roopip-calendar`)
- `POST /accounts/{account}/d1/database/{database}/query` with body `{ "sql": "...", "params": [...] }`. Use `?` placeholders and always pass values as params.

Tables (see `migrations/0001_init.sql`):

- `slots(id, date, data, updated_at, updated_by)`. `data` is the whole slot as JSON. Its shape is `Slot` in `src/lib/types.ts`.
- `settings(key, value)`. `value` is JSON. Keys: `generatedWeeks` (Mondays already planned) and `extraIdeas` (ideas Claude added, `Idea[]`).

Product names, sizes, colours and prices are in the product master sheet. Read it with the **Google Drive connector**, using file id `1qVv9XyEMTR0-DGG6EID49dnKz1Kn-EfWtv6hSTNSQHg`.

## Rules for every run

1. **Never overwrite someone's newer edit.** Update a slot only with

   ```sql
   UPDATE slots SET data = ?, updated_at = ?, updated_by = 'claude' WHERE id = ? AND updated_at = ?
   ```

   Pass the `updated_at` you read as the last param. If `meta.changes` is 0, someone edited the slot meanwhile. Skip it, and it will be picked up next run.
2. In `data`, set `updatedAt` to the same new ISO time as `updated_at`.
3. Record what you did in `data.claude = { at, note, previous }`. `note` is one or two plain sentences for Carli. `previous` holds the old values of every field you changed: `title`, `prompt`, `shots`, `caption`, `hashtags`, `cta` or `storyboard`. The app's "Undo Claude's changes" button restores them.
4. Change only `title`, `prompt`, `shots`, `caption`, `hashtags`, `cta`, `storyboard` (reels), `askClaude`, `claude` and `notes`. Never touch `status`, `media`, `date`, `time`, `format`, `music` or `locked`, and never delete slots.
5. Leave `locked` slots alone unless they are marked `askClaude`. A request beats a lock.
6. Leave anything with status `approved`, `scheduled` or `posted` alone. Carli has signed it off.
7. Use only the claims in `BRAND.approvedClaims` (`src/lib/brand.ts`). If a request asks for anything else, such as "eco-certified", "waterproof" or "organic", don't write it, and say why in the note.
8. Do not open `Roopip_Social_Media_Manager_Start_Up_Checklist` in Drive. It holds passwords. Everything you need from it is already in `src/lib/brand.ts`.
9. Don't commit or push to the repo, and don't open pull requests. These runs change calendar data only.
10. End with a short summary of what changed: slot dates and titles. If nothing needed doing, say so in one line.
