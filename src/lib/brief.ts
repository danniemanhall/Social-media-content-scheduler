import { sceneForSlot, sceneForText, type Scene } from "./brandFit";
import { FORMAT_LABEL } from "./brand";
import { addDays, dayName, monthName, shortDate, weekStart } from "./dates";
import { weekTheme } from "./playbook";
import type { Format, MediaRef, Pillar, ProductFamily, Slot, Status } from "./types";

/**
 * The month brief: a calm, read-only page for Roopip's content creator and
 * photographer. One card per planned post (what to shoot, which photos to use,
 * what to design in Canva, the caption for context, a note from the team),
 * with the month's shoot list grouped by photo session on top.
 *
 * Pure: the same code builds the page on the server (functions/brief) and its
 * tests, so the creator always sees the calendar as it is right now.
 */

export const BRIEF_KEY = "secret:brief";

export interface BriefLink {
  token: string;
  createdAt: string;
  createdBy: string | null;
}

/** An unguessable link token (the URL is the creator's key, alongside Cloudflare Access). */
export function newBriefToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** The month a plan is usually being made for: next month from the 15th on, this month before. */
export function defaultBriefMonth(today: string): string {
  const month = today.slice(0, 7);
  return Number(today.slice(8, 10)) >= 15 ? shiftMonth(month, 1) : month;
}

/** Canva canvas size for each format, so the creator never has to ask. */
export const CANVA_SIZE: Record<Format, string> = {
  reel: "1080 × 1920 (9:16)",
  story: "1080 × 1920 (9:16)",
  post: "1080 × 1350 (4:5)",
  carousel: "1080 × 1350 (4:5) per slide",
};

/** Posts at these stages are finished; their shots stay off the shoot list. */
const DONE: Status[] = ["approved", "scheduled", "posted"];

export interface BriefPost {
  id: string;
  date: string;
  time: string;
  format: Format;
  pillar: Pillar;
  product?: ProductFamily;
  title: string;
  prompt: string;
  shots: string[];
  media: MediaRef[];
  caption: string;
  onScreen: string[];
  canvaDesign?: string;
  song?: string;
  note?: string;
  done: boolean;
}

export interface BriefShot {
  text: string;
  postId: string;
  date: string;
  format: Format;
  product?: ProductFamily;
}

export interface BriefSession {
  scene: Scene | "other";
  title: string;
  hint: string;
  /** The first post date that needs a shot from this session. */
  firstNeeded: string;
  shots: BriefShot[];
}

export interface BriefWeek {
  monday: string;
  theme: string;
  posts: BriefPost[];
}

export interface Brief {
  month: string;
  posts: BriefPost[];
  weeks: BriefWeek[];
  sessions: BriefSession[];
  /** Slots in the month nobody has planned yet. */
  open: number;
  counts: { reels: number; grid: number; storyDays: number };
}

const SESSION: Record<Scene | "other", { title: string; hint: string; order: number }> = {
  lifestyle: { title: "Styled at home", hint: "Calm rooms and tables, natural light, wood, linen and greenery.", order: 1 },
  product: { title: "Product shots", hint: "One piece at a time on a clean, plain backdrop.", order: 2 },
  process: { title: "In the workshop", hint: "Hands, rope, sewing and dyeing: the making.", order: 3 },
  detail: { title: "Close-ups and texture", hint: "Fill the frame with rope, stitching and colour.", order: 4 },
  other: { title: "Everything else", hint: "", order: 5 },
};

const planned = (s: Slot) => !!(s.ideaId || s.title.trim());

export function chosenShots(s: Pick<Slot, "shots" | "shotsChosen">): string[] {
  const list = s.shots.map((x) => x.trim());
  const picked = s.shotsChosen ? s.shotsChosen.map((i) => list[i]) : list;
  return picked.filter((x): x is string => !!x);
}

export function buildBrief(slots: Slot[], month: string): Brief {
  const { from, to } = monthRange(month);
  const inMonth = slots.filter((s) => s.date >= from && s.date <= to).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const posts: BriefPost[] = inMonth.filter(planned).map((s) => ({
    id: s.id,
    date: s.date,
    time: s.time,
    format: s.format,
    pillar: s.pillar,
    product: s.product,
    title: s.title.trim(),
    prompt: s.prompt.trim(),
    shots: chosenShots(s),
    media: s.media ?? [],
    caption: s.caption.trim(),
    onScreen: (s.storyboard?.shots ?? []).map((x) => x.text?.trim() ?? "").filter(Boolean),
    canvaDesign: s.canvaDesign?.title,
    song: s.song?.title,
    note: s.briefNote?.trim() || undefined,
    done: DONE.includes(s.status),
  }));

  const groups = new Map<Scene | "other", BriefShot[]>();
  for (const p of posts) {
    if (p.done) continue;
    const slot = inMonth.find((s) => s.id === p.id)!;
    const fallback = sceneForSlot(slot);
    for (const text of p.shots) {
      const scene = sceneForText(text) ?? fallback ?? "other";
      const list = groups.get(scene) ?? [];
      list.push({ text, postId: p.id, date: p.date, format: p.format, product: p.product });
      groups.set(scene, list);
    }
  }
  const sessions: BriefSession[] = [...groups.entries()]
    .map(([scene, shots]) => ({
      scene,
      title: SESSION[scene].title,
      hint: SESSION[scene].hint,
      firstNeeded: shots.reduce((d, s) => (s.date < d ? s.date : d), shots[0].date),
      // Same product together within a session, then by date.
      shots: [...shots].sort((a, b) => (a.product ?? "~").localeCompare(b.product ?? "~") || a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => SESSION[a.scene].order - SESSION[b.scene].order);

  const weeks: BriefWeek[] = [];
  for (const p of posts) {
    const monday = weekStart(p.date);
    let w = weeks.at(-1);
    if (!w || w.monday !== monday) weeks.push((w = { monday, theme: weekTheme(p.date).name, posts: [] }));
    w.posts.push(p);
  }

  const storyDays = new Set(posts.filter((p) => p.format === "story").map((p) => p.date)).size;
  return {
    month,
    posts,
    weeks,
    sessions,
    open: inMonth.length - posts.length,
    counts: {
      reels: posts.filter((p) => p.format === "reel").length,
      grid: posts.filter((p) => p.format === "post" || p.format === "carousel").length,
      storyDays,
    },
  };
}

/* ---------- HTML ---------- */

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface RenderOptions {
  /** Base path of this brief, e.g. /brief/abc123. */
  base: string;
  /** True when Drive is connected on the server, so photo previews can be shown. */
  photos: boolean;
  /** When the page was made, for "Updated …". */
  now: Date;
  /** Hide the month arrows and print button (used inside the app's preview). */
  embedded?: boolean;
}

function postLabel(p: Pick<BriefPost, "date" | "format">) {
  return `${FORMAT_LABEL[p.format]}, ${dayName(p.date)} ${shortDate(p.date)}`;
}

function mediaHtml(m: MediaRef, o: RenderOptions, month: string) {
  const name = esc(m.name);
  const video = m.mimeType.startsWith("video/");
  if (m.source === "drive" && o.photos) {
    const src = `${o.base}/img/${encodeURIComponent(m.id)}?m=${month}`;
    return `<a class="ph" href="${src}&amp;size=1600" target="_blank" rel="noopener" title="${name}"><img src="${src}" alt="${name}" loading="lazy">${video ? '<span class="play">▶</span>' : ""}<span class="nm">${name}</span></a>`;
  }
  const where = m.source === "local" ? "on the team's computer" : "in Roopip's Drive";
  return `<span class="ph none" title="${name}"><span class="nm">${name}</span><span class="wh">${where}</span></span>`;
}

function postHtml(p: BriefPost, o: RenderOptions, month: string) {
  const bits: string[] = [];
  if (p.prompt) bits.push(`<p class="idea">${esc(p.prompt)}</p>`);
  if (p.note) bits.push(`<div class="note"><b>Note for you</b>${esc(p.note)}</div>`);
  if (!p.done && p.shots.length)
    bits.push(`<h4>Photos to take</h4><ul class="shots">${p.shots.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`);
  if (p.media.length) bits.push(`<h4>${p.done ? "Photos used" : "Photos to use"}</h4><div class="phs">${p.media.map((m) => mediaHtml(m, o, month)).join("")}</div>`);
  if (!p.done) {
    const canva = p.canvaDesign
      ? `Already started in Canva: <i>${esc(p.canvaDesign)}</i>.`
      : `Canvas ${CANVA_SIZE[p.format]}.`;
    bits.push(`<h4>In Canva</h4><p>${canva}${p.onScreen.length ? ` Words on screen: ${p.onScreen.map((t) => `“${esc(t)}”`).join(", ")}.` : ""}${p.song ? ` Music: ${esc(p.song)} (added by the team).` : ""}</p>`);
  }
  if (p.caption) bits.push(`<h4>Caption</h4><p class="cap">${esc(p.caption)}</p>`);
  const tags = [
    `<span class="chip fmt">${FORMAT_LABEL[p.format]}</span>`,
    `<span class="chip">${esc(p.pillar)}</span>`,
    p.product ? `<span class="chip soft">${esc(p.product)}</span>` : "",
    p.done ? `<span class="chip done">Done</span>` : "",
  ].join("");
  return `<article class="post${p.done ? " is-done" : ""}" id="p-${esc(p.id)}">
<div class="when"><b>${dayName(p.date)} ${shortDate(p.date)}</b><span>${esc(p.time)}</span></div>
<div class="body"><div class="tags">${tags}</div><h3>${esc(p.title)}</h3>${bits.join("")}</div>
</article>`;
}

function sessionsHtml(b: Brief) {
  if (!b.sessions.length) return "";
  const list = b.sessions
    .map(
      (s) => `<section class="session"><h3>${esc(s.title)} <span>${plural(s.shots.length, "shot")} · first needed ${dayName(s.firstNeeded)} ${shortDate(s.firstNeeded)}</span></h3>
${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ""}<ul>${s.shots
        .map((x) => `<li><span class="box" aria-hidden="true"></span><span>${esc(x.text)}<a class="for" href="#p-${esc(x.postId)}">${postLabel(x)}${x.product ? ` · ${esc(x.product)}` : ""}</a></span></li>`)
        .join("")}</ul></section>`,
    )
    .join("");
  return `<section class="shoot"><h2>Shoot list</h2><p class="lede">Every photo this month needs, grouped so each set can be shot in one go.</p>${list}</section>`;
}

export function renderBriefHtml(b: Brief, o: RenderOptions): string {
  const title = `${monthName(`${b.month}-01`)}`;
  const updated = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(o.now);
  const summary = [plural(b.counts.reels, "reel"), plural(b.counts.grid, "grid post"), plural(b.counts.storyDays, "story day")].join(" · ");
  const nav = o.embedded
    ? ""
    : `<nav class="nav no-print"><a href="${o.base}?m=${shiftMonth(b.month, -1)}">‹ ${esc(monthName(`${shiftMonth(b.month, -1)}-01`))}</a><button type="button" onclick="window.print()">Print or save as PDF</button><a href="${o.base}?m=${shiftMonth(b.month, 1)}">${esc(monthName(`${shiftMonth(b.month, 1)}-01`))} ›</a></nav>`;
  const weeks = b.weeks
    .map((w) => `<section class="week"><h2>Week of ${shortDate(w.monday)} <span>${esc(w.theme)}</span></h2>${w.posts.map((p) => postHtml(p, o, b.month)).join("")}</section>`)
    .join("");
  const empty = b.posts.length
    ? ""
    : `<p class="empty">Nothing is planned for ${esc(title)} yet. This page fills in as posts are planned.</p>`;
  const openLine = b.open ? `<p class="open">${plural(b.open, "more post")} still being planned. ${b.open === 1 ? "It appears" : "They appear"} here when ready.</p>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>Roopip brief · ${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body${o.embedded ? ' class="embedded"' : ""}>
<div class="page">
${nav}
<header class="top"><img src="${o.base.replace(/\/[^/]+$/, "")}/logo.png" alt="Roopip" width="120" height="27"><h1>${esc(title)}</h1>
<p class="sum">${summary}</p><p class="upd">Content brief · updated ${esc(updated)}</p></header>
${empty}
${sessionsHtml(b)}
${weeks}
${openLine}
<footer>Questions about a post? Ask the team. This page always shows the latest plan.</footer>
</div></body></html>`;
}

const CSS = `
:root{--ivory:#F3F0E9;--sand:#e6ccb1;--stone:#c3afa0;--ink:#332a22;--sage:#68705a;--clay:#a17a5e;--line:#e2d9cc;--muted:#7a6e63}
*{box-sizing:border-box}
html{background:var(--ivory)}
body{margin:0;color:var(--ink);font:15px/1.55 "DM Sans",system-ui,sans-serif;background:var(--ivory)}
.page{max-width:760px;margin:0 auto;padding:24px 16px 48px}
h1,h2,h3{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;line-height:1.2;margin:0}
h1{font-size:40px;margin-top:10px}
h2{font-size:26px;margin:36px 0 12px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline}
h2 span,h3 span{font:500 13px "DM Sans",sans-serif;color:var(--muted)}
h3{font-size:21px}
h4{font:600 11px "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--clay);margin:14px 0 4px}
p{margin:4px 0}
a{color:inherit}
.top img{display:block}
.sum{margin-top:6px;font-weight:500}
.upd,.lede,.hint,.open,footer{color:var(--muted);font-size:13px}
.nav{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:20px;font-size:13px}
.nav a{text-decoration:none;color:var(--muted)}
.nav button{font:500 13px "DM Sans",sans-serif;border:1px solid var(--stone);background:#fff;color:var(--ink);border-radius:999px;padding:7px 14px;cursor:pointer}
.shoot{background:#fff;border:1px solid var(--line);border-radius:14px;padding:4px 18px 16px;margin-top:24px}
.shoot h2{margin-top:16px}
.session{margin-top:16px}
.session ul{list-style:none;margin:8px 0 0;padding:0}
.session li{display:flex;gap:10px;padding:6px 0;border-top:1px solid var(--line)}
.box{flex:none;width:14px;height:14px;border:1.5px solid var(--stone);border-radius:3px;margin-top:4px}
.for{display:block;color:var(--muted);font-size:12px;text-decoration:none}
.post{display:grid;grid-template-columns:76px 1fr;gap:14px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin:12px 0;break-inside:avoid}
.when b{display:block;font-family:"Cormorant Garamond",serif;font-size:19px;line-height:1.15}
.when span{color:var(--muted);font-size:13px}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.chip{font-size:11px;font-weight:500;padding:2px 9px;border-radius:999px;background:var(--ivory);border:1px solid var(--line)}
.chip.fmt{background:var(--ink);color:var(--ivory);border-color:var(--ink)}
.chip.soft{background:#fff}
.chip.done{background:var(--sage);color:#fff;border-color:var(--sage)}
.is-done{opacity:.6}
.idea{color:var(--muted)}
.note{background:#f8efe4;border-left:3px solid var(--clay);padding:8px 12px;border-radius:6px;margin-top:10px}
.note b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--clay)}
.shots{margin:0;padding-left:18px}
.phs{display:flex;flex-wrap:wrap;gap:8px}
.ph{position:relative;display:flex;flex-direction:column;width:104px;text-decoration:none;font-size:11px;color:var(--muted)}
.ph img{width:104px;height:104px;object-fit:cover;border-radius:8px;background:var(--ivory)}
.ph .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px}
.ph.none{height:auto;border:1px dashed var(--stone);border-radius:8px;padding:8px;width:auto;max-width:220px}
.ph.none .nm{color:var(--ink);white-space:normal}
.play{position:absolute;top:38px;left:42px;color:#fff;font-size:20px;text-shadow:0 1px 4px rgba(0,0,0,.5)}
.cap{white-space:pre-wrap;font-size:14px;color:var(--muted)}
.empty{margin-top:28px;font-size:16px}
footer{margin-top:36px;border-top:1px solid var(--line);padding-top:12px}
body.embedded .page{padding-top:8px}
@media (max-width:520px){.post{grid-template-columns:1fr;gap:6px}.when{display:flex;gap:8px;align-items:baseline}h1{font-size:32px}}
@media print{
  @page{margin:14mm}
  html,body{background:#fff}
  .no-print{display:none!important}
  .page{max-width:none;padding:0}
  .post,.shoot{border-color:#d8d0c4}
  .shoot{break-after:page}
  .week h2{break-after:avoid}
  footer{display:none}
  a.for{color:var(--muted)}
}
`;
