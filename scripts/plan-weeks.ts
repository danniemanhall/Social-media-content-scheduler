/**
 * Used by Claude's monthly run. Plans weeks the same way the app does, without a browser.
 *
 *   npx vite-node scripts/plan-weeks.ts -- input.json > output.json
 *
 * input.json:  { "from": "2026-12-01", "to": "2026-12-31", "today": "2026-11-22",
 *                "slots": [...existing slots from 8 weeks before `from` to `to`...],
 *                "generatedWeeks": [...], "extraIdeas": [...] }
 * output.json: { "fresh": [...new slots to insert...], "generatedWeeks": [...the full new list...] }
 */
import { readFileSync } from "node:fs";
import { ideaBank, planRange } from "../src/lib/planner";
import { weekStart } from "../src/lib/dates";
import type { Idea, Slot } from "../src/lib/types";

const file = process.argv.slice(2).filter((a) => a !== "--")[0];
if (!file) throw new Error("usage: vite-node scripts/plan-weeks.ts -- input.json");
const input = JSON.parse(readFileSync(file, "utf8")) as {
  from: string;
  to: string;
  today: string;
  slots: Slot[];
  generatedWeeks?: string[];
  extraIdeas?: Idea[];
};
const generated = input.generatedWeeks ?? [];
const { fresh, newWeeks } = planRange(input.from, input.to, input.slots, generated, ideaBank(input.extraIdeas), weekStart(input.today));
const stamp = new Date().toISOString();
process.stdout.write(
  JSON.stringify(
    { fresh: fresh.map((s) => ({ ...s, updatedAt: stamp })), generatedWeeks: [...new Set([...generated, ...newWeeks])].sort() },
    null,
    1,
  ),
);
