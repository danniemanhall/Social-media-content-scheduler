import type { Slot } from "./types";

/** Where calendar data lives: the shared Cloudflare D1 database, or this browser only. */
export interface Store {
  mode: "shared" | "device";
  load(from: string, to: string): Promise<Slot[]>;
  save(slots: Slot[]): Promise<void>;
  remove(id: string): Promise<void>;
  getSetting<T>(key: string): Promise<T | null>;
  setSetting<T>(key: string, value: T): Promise<void>;
}

class ApiStore implements Store {
  mode = "shared" as const;
  private async req(path: string, init?: RequestInit) {
    const res = await fetch(`/api/${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }
  load(from: string, to: string) {
    return this.req(`slots?from=${from}&to=${to}`) as Promise<Slot[]>;
  }
  async save(slots: Slot[]) {
    if (slots.length) await this.req("slots", { method: "PUT", body: JSON.stringify(slots) });
  }
  async remove(id: string) {
    await this.req(`slots/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  async getSetting<T>(key: string) {
    return ((await this.req(`settings/${key}`)) as { value: T | null }).value;
  }
  async setSetting<T>(key: string, value: T) {
    await this.req(`settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
  }
}

const LS_SLOTS = "roopip.slots";
const LS_SETTINGS = "roopip.settings";

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export class LocalStore implements Store {
  mode = "device" as const;
  private slots: Record<string, Slot> = readLS(LS_SLOTS, {});
  private settings: Record<string, unknown> = readLS(LS_SETTINGS, {});
  async load(from: string, to: string) {
    return Object.values(this.slots).filter((s) => s.date >= from && s.date <= to);
  }
  async save(slots: Slot[]) {
    for (const s of slots) this.slots[s.id] = s;
    writeLS(LS_SLOTS, this.slots);
  }
  async remove(id: string) {
    delete this.slots[id];
    writeLS(LS_SLOTS, this.slots);
  }
  async getSetting<T>(key: string) {
    return (this.settings[key] as T) ?? null;
  }
  async setSetting<T>(key: string, value: T) {
    this.settings[key] = value;
    writeLS(LS_SETTINGS, this.settings);
  }
}

/** Use the shared database when the API answers, otherwise fall back to this browser. */
export async function openStore(): Promise<Store> {
  try {
    const res = await fetch("/api/health");
    if (res.ok && ((await res.json()) as { db?: boolean }).db) return new ApiStore();
  } catch {
    /* no API (local dev with plain vite) */
  }
  return new LocalStore();
}

export async function whoAmI(): Promise<string | null> {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return null;
    return ((await res.json()) as { email: string | null }).email;
  } catch {
    return null;
  }
}
