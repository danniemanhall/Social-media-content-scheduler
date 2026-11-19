import { useCallback, useEffect, useState } from "react";
import { EVENTS_KEY, EVENTS_SEED_KEY, EVENTS_SEED_VERSION, mergeDefaults, sortEvents, type BrandEvent } from "./events";
import type { Store } from "./store";

/**
 * The shared events list (settings key `events`). Built-in events are added
 * once per seed version; removing a built-in one hides it so it stays gone.
 */
export function useEvents(store: Store) {
  const [events, setEvents] = useState<BrandEvent[]>(() => mergeDefaults(null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const saved = await store.getSetting<BrandEvent[]>(EVENTS_KEY);
        const seeded = (await store.getSetting<number>(EVENTS_SEED_KEY)) ?? 0;
        const list = seeded >= EVENTS_SEED_VERSION && saved ? sortEvents(saved) : mergeDefaults(saved);
        if (seeded < EVENTS_SEED_VERSION) {
          await store.setSetting(EVENTS_KEY, list);
          await store.setSetting(EVENTS_SEED_KEY, EVENTS_SEED_VERSION);
        }
        if (live) setEvents(list);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [store]);

  const persist = useCallback(
    async (next: BrandEvent[]) => {
      const sorted = sortEvents(next);
      setEvents(sorted);
      try {
        await store.setSetting(EVENTS_KEY, sorted);
      } catch (e) {
        setError(`Couldn't save events: ${e instanceof Error ? e.message : e}`);
      }
    },
    [store],
  );

  /** Add or replace events by id. */
  const save = useCallback(
    (items: BrandEvent[]) => {
      const byId = new Map(events.map((e) => [e.id, e]));
      for (const e of items) byId.set(e.id, e);
      return persist([...byId.values()]);
    },
    [events, persist],
  );

  const remove = useCallback(
    (id: string) => {
      const e = events.find((x) => x.id === id);
      if (!e) return Promise.resolve();
      // Built-in events are hidden, not deleted, so the next seed doesn't bring them back.
      const builtIn = e.source === "doc" || e.source === "researched";
      return persist(builtIn ? events.map((x) => (x.id === id ? { ...x, hidden: true } : x)) : events.filter((x) => x.id !== id));
    },
    [events, persist],
  );

  return { events, visible: events.filter((e) => !e.hidden), error, save, remove };
}

export type EventsState = ReturnType<typeof useEvents>;
