/**
 * Free music to browse in the post flow's music step.
 *
 * Searches Openverse (api.openverse.org, run by WordPress, no key needed) for
 * Jamendo tracks under CC0 or CC BY. Both licences allow commercial use and
 * changes, so a track can go into a Roopip reel. CC BY asks for a credit, which
 * is drawn small on the video when the music is added (see `creditOf`). Share-alike and
 * non-commercial tracks are never shown.
 *
 * The browser calls Openverse directly, so the limit (about 20 searches a
 * minute, 200 a day) is per person, not shared by the whole server.
 */

const API = "https://api.openverse.org/v1/audio/";

export interface FreeTrack {
  id: string;
  title: string;
  creator: string;
  license: "cc0" | "by";
  licenseVersion: string;
  /** The MP3 itself. */
  url: string;
  /** The track's page on Jamendo. */
  page: string;
  seconds: number;
  tags: string[];
}

export interface FreeMusicPage {
  tracks: FreeTrack[];
  more: boolean;
}

interface OpenverseAudio {
  id: string;
  title?: string;
  creator?: string;
  license: string;
  license_version?: string;
  url: string;
  foreign_landing_url?: string;
  duration?: number | null;
  tags?: { name: string }[] | null;
  mature?: boolean;
}

/** Tags that mean a song with singing or a mood that doesn't suit Roopip. */
const UNWANTED = ["vocal", "male", "female", "sad", "dark", "aggressive", "metal", "rap", "hiphop", "revolutionary"];

/** Keeps instrumental tracks between 30 seconds and 7 minutes, instrumental first. */
export function pickTracks(results: OpenverseAudio[]): FreeTrack[] {
  return results
    .filter((r) => (r.license === "cc0" || r.license === "by") && !r.mature && r.url)
    .map((r) => ({
      id: r.id,
      title: decode(r.title ?? "Untitled"),
      creator: decode(r.creator ?? "Unknown artist"),
      license: r.license as "cc0" | "by",
      licenseVersion: r.license_version ?? "",
      url: r.url,
      page: r.foreign_landing_url ?? "",
      seconds: Math.round((r.duration ?? 0) / 1000),
      tags: (r.tags ?? []).map((t) => t.name.toLowerCase()),
    }))
    .filter((t) => t.seconds >= 30 && t.seconds <= 420 && !t.tags.some((x) => UNWANTED.includes(x)))
    .sort((a, b) => Number(b.tags.includes("instrumental")) - Number(a.tags.includes("instrumental")));
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export async function searchFreeMusic(query: string, page = 1): Promise<FreeMusicPage> {
  const params = new URLSearchParams({ q: query.trim() || "instrumental", license: "cc0,by", source: "jamendo", page_size: "20", page: String(page), format: "json" });
  let res: Response;
  try {
    res = await fetch(`${API}?${params}`);
  } catch {
    throw new Error("Couldn't reach the free music library. Check the connection and try again.");
  }
  if (res.status === 429) throw new Error("The free music library needs a short break (too many searches). Try again in a minute.");
  if (!res.ok) throw new Error(`The free music library said ${res.status}.`);
  const body = (await res.json()) as { results: OpenverseAudio[]; page_count: number };
  return { tracks: pickTracks(body.results ?? []), more: page < (body.page_count ?? 0) };
}

/** The credit CC BY asks for, e.g. `Music: "Lucky Acoustic" by Jesse Keller (CC BY 3.0)`. None for CC0. */
export function creditOf(t: Pick<FreeTrack, "title" | "creator" | "license" | "licenseVersion">): string | undefined {
  if (t.license !== "by") return undefined;
  return `Music: "${t.title}" by ${t.creator} (CC BY${t.licenseVersion ? ` ${t.licenseVersion}` : ""})`;
}

export const licenseLabel = (t: Pick<FreeTrack, "license" | "licenseVersion">) => (t.license === "cc0" ? "CC0, no credit needed" : `CC BY ${t.licenseVersion}, credited on the video`.replace("  ", " "));

/** "Title - Artist (CC BY 3.0).mp3": the licence stays in the name, so the credit comes back when the track is reused from Drive. */
export const fileNameOf = (t: Pick<FreeTrack, "title" | "creator" | "license" | "licenseVersion">) =>
  `${t.title} - ${t.creator} (${t.license === "cc0" ? "CC0" : `CC BY ${t.licenseVersion}`.trim()}).mp3`.replace(/[\\/:*?"<>|]/g, "-");

/** Reads the credit back from a file name made by `fileNameOf`. */
export function creditFromName(name: string): string | undefined {
  const m = /^(.*) - (.*) \(CC BY ?([\d.]*)\)\.[a-z0-9]+$/i.exec(name);
  return m ? creditOf({ title: m[1], creator: m[2], license: "by", licenseVersion: m[3] }) : undefined;
}

export const lengthOf = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export async function downloadFreeTrack(t: Pick<FreeTrack, "url">): Promise<Blob> {
  const res = await fetch(t.url);
  if (!res.ok) throw new Error(`Couldn't download the track (${res.status}).`);
  return new Blob([await res.arrayBuffer()], { type: "audio/mpeg" });
}
