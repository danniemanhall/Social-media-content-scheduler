# Monthly fill

This run makes sure next month is fully planned with captions written for its dates, and tops up the idea bank. "Next month" means the calendar month after the one the run happens in.

1. Read `README.md` and `voice.md` in this folder, then read the product master sheet.
2. **Plan any missing weeks.**
   - Read slots from 8 weeks before the 1st of next month to its last day: `SELECT data FROM slots WHERE date >= ? AND date <= ?`.
   - Read the settings `generatedWeeks` and `extraIdeas`.
   - Write them to a scratch file as `{ from, to, today, slots, generatedWeeks, extraIdeas }`. `from` is the 1st of next month, `to` is its last day and `today` is today.
   - Run `npm ci` once, then `npx vite-node scripts/plan-weeks.ts -- <file>`.
   - Insert each slot in `fresh` with `INSERT OR IGNORE INTO slots (id, date, data, updated_at, updated_by) VALUES (?, ?, ?, ?, 'claude')`.
   - Then save the returned `generatedWeeks` with `INSERT INTO settings (key, value) VALUES ('generatedWeeks', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`.
3. **Read the brain for next month.** Read the setting `events`, then run `scripts/event-brief.ts` for next month (see "The content brain" in `README.md`). Use its themes, events and suggestions in steps 4 and 5.
4. **Write captions for the dates.** Planned slots now start **open** (`ideaId` is empty): people pick the idea in the app's guided steps, so leave open slots alone. For every slot next month that has an idea (`ideaId` set), is status `idea`, not locked and has no `step` (not being worked on in the guided steps), rewrite the caption, hashtags and call to action so they suit that week. Use the South African dates and seasons in `voice.md`, the events and their phase from the brief (an event that is on or coming up gets its call to action from the event's channels), and the product's real names and colours from the sheet. Keep the idea itself (`title`, `prompt`, `shots`) unless it clashes with the date, for example a winter idea in December. In that case pick a better-fitting idea of the same format from the bank, and say so in the note. Save each slot by the rules in `README.md`, with a short note such as "Caption refreshed for Heritage Day week."
5. **Top up the idea bank.** Add 6 to 10 new ideas to `extraIdeas`, covering the coming two months and spread across formats and pillars. Include 2 or 3 for the biggest events coming up (with `months` set), and the rest evergreen ideas that follow the playbook's weekly themes and grid rules.
   - Each idea must match the `Idea` type in `src/lib/types.ts`. Use ids starting `claude-YYYY-MM-`.
   - Don't repeat an idea already in `src/lib/ideas.ts` or `extraIdeas`.
   - Set `months` for seasonal ideas.
   - Keep the list to at most 80 ideas by dropping the oldest Claude ideas first. Save it with the same `INSERT ... ON CONFLICT` pattern.
6. Finish with the summary: how many slots you planned, how many captions you wrote, the titles of the new ideas, and any deal deadlines (`submitBy`) in the next 6 weeks.
