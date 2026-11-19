/**
 * Used by Claude's scheduled runs. Prints, for each day in a range, the events
 * and sales in play (build-up, announce, on now, last chance, thank you), deal
 * deadlines, the Drive playbook's theme for the week, and the ideas the app
 * would suggest, so captions and new ideas follow the same brain as the app.
 *
 *   npx vite-node scripts/event-brief.ts -- input.json > brief.json
 *
 * input.json: { "from": "2026-12-01", "to": "2026-12-31",
 *               "events": [...settings `events`, or omit for the built-in list...],
 *               "extraIdeas": [...settings `extraIdeas`...] }
 */
import { readFileSync } from "node:fs";
import { addDays } from "../src/lib/dates";
import { mergeDefaults, PHASE_LABEL, type BrandEvent } from "../src/lib/events";
import { ideaBank } from "../src/lib/planner";
import { suggestIdeas } from "../src/lib/suggest";
import type { Format, Idea } from "../src/lib/types";

const file = process.argv.slice(2).filter((a) => a !== "--")[0];
if (!file) throw new Error("usage: vite-node scripts/event-brief.ts -- input.json");
const input = JSON.parse(readFileSync(file, "utf8")) as { from: string; to: string; events?: BrandEvent[]; extraIdeas?: Idea[] };
const events = mergeDefaults(input.events ?? null).filter((e) => !e.hidden);
const bank = ideaBank(input.extraIdeas);
const days = [];
for (let d = input.from; d <= input.to; d = addDays(d, 1)) {
  const byFormat: Record<string, { id: string; title: string; reason: string }[]> = {};
  let theme = "";
  let moments: string[] = [];
  let tasks: string[] = [];
  for (const formats of [["story"], ["reel"], ["post", "carousel"]] as Format[][]) {
    const out = suggestIdeas({ date: d, formats, bank, events, count: 5 });
    byFormat[formats.join("/")] = out.ideas.map((i) => ({ id: i.id, title: i.title, reason: i.reason }));
    theme = out.theme.name;
    moments = out.moments.filter((m) => m.phase !== "submit").map((m) => `${m.event.title}: ${PHASE_LABEL[m.phase]}`);
    tasks = out.tasks;
  }
  days.push({ date: d, theme, moments, tasks, suggestions: byFormat });
}
process.stdout.write(JSON.stringify(days, null, 1));
