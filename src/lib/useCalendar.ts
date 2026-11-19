import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { planRange, shuffleSlot, ideaBank, openSlot, replan, COOLDOWN_WEEKS, EXTRA_IDEAS_KEY, PLAN_VERSION, PLAN_VERSION_KEY } from "./planner";
import { addDays, todayISO, weekStart } from "./dates";
import type { Store } from "./store";
import type { ClaudeFields, Format, Idea, Slot } from "./types";

const GENERATED_KEY = "generatedWeeks";

let migrating: Promise<void> | null = null;

/**
 * Once per plan version: weeks planned with the old template (topics already
 * filled in) become open slots, keeping anything someone has worked on.
 */
function migratePlan(store: Store): Promise<void> {
  migrating ??= (async () => {
    if (((await store.getSetting<number>(PLAN_VERSION_KEY)) ?? 1) >= PLAN_VERSION) return;
    const today = todayISO();
    const existing = await store.load(today, addDays(today, 400));
    const { remove, add } = replan(existing, today);
    for (const id of remove) await store.remove(id);
    await store.save(add);
    await store.setSetting(PLAN_VERSION_KEY, PLAN_VERSION);
  })().catch((e) => {
    migrating = null;
    throw e;
  });
  return migrating;
}

/**
 * Calendar state: loads slots for the weeks on screen, plans any upcoming
 * week that has never been planned, and saves every change.
 */
export function useCalendar(store: Store) {
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>(() => ideaBank(null));
  const loadedRange = useRef<{ from: string; to: string } | null>(null);
  const thisWeek = weekStart(todayISO());

  const ensureRange = useCallback(
    async (from: string, to: string) => {
      setLoading(true);
      setError(null);
      try {
        await migratePlan(store);
        const histFrom = addDays(weekStart(from), -7 * COOLDOWN_WEEKS);
        const existing = await store.load(histFrom, to);
        const generated = new Set((await store.getSetting<string[]>(GENERATED_KEY)) ?? []);
        const bank = ideaBank(await store.getSetting<Idea[]>(EXTRA_IDEAS_KEY));
        setIdeas(bank);
        const { fresh, newWeeks } = planRange(from, to, existing, generated, bank, thisWeek);
        const all = [...existing, ...fresh];
        if (fresh.length) await store.save(fresh);
        if (newWeeks.length) await store.setSetting(GENERATED_KEY, [...generated, ...newWeeks].sort());
        setSlots((prev) => {
          const next = { ...prev };
          for (const s of all) next[s.id] = s;
          return next;
        });
        loadedRange.current = { from: histFrom, to };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [store, thisWeek],
  );

  const update = useCallback(
    async (slot: Slot) => {
      const next = { ...slot, updatedAt: new Date().toISOString() };
      setSlots((prev) => ({ ...prev, [next.id]: next }));
      try {
        await store.save([next]);
      } catch (e) {
        setError(`Couldn't save: ${e instanceof Error ? e.message : e}`);
      }
    },
    [store],
  );

  const remove = useCallback(
    async (id: string) => {
      setSlots((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await store.remove(id);
    },
    [store],
  );

  const all = useMemo(
    () => Object.values(slots).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
    [slots],
  );

  const add = useCallback(
    async (date: string, format: Format) => {
      const time = format === "story" ? "10:00" : "12:30";
      const slot = openSlot(date, time, format, `${date}-${format}-${crypto.randomUUID().slice(0, 8)}`);
      await update(slot);
      return slot;
    },
    [update],
  );

  const move = useCallback(
    async (id: string, date: string) => {
      const s = slots[id];
      if (s && s.date !== date) await update({ ...s, date });
    },
    [slots, update],
  );

  const shuffle = useCallback(
    async (id: string) => {
      const s = slots[id];
      if (!s || s.locked) return s;
      const next = shuffleSlot(s, all, undefined, ideas);
      await update(next);
      return next;
    },
    [slots, all, ideas, update],
  );

  /** Put back the fields Claude changed, and clear its note. */
  const undoClaude = useCallback(
    async (id: string) => {
      const s = slots[id];
      if (!s?.claude) return s;
      const next: Slot = { ...s, ...(s.claude.previous as Partial<ClaudeFields>), claude: undefined };
      await update(next);
      return next;
    },
    [slots, update],
  );

  useEffect(() => {
    setSlots({});
  }, [store]);

  return { slots: all, byId: slots, ideas, loading, error, ensureRange, update, remove, add, move, shuffle, undoClaude };
}

export type Calendar = ReturnType<typeof useCalendar>;
