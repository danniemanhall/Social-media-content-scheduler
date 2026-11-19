export type Format = "reel" | "story" | "post" | "carousel";
/** A grid slot is filled by either a single-image post or a carousel. */
export type SlotKind = "reel" | "story" | "grid";

export type Pillar =
  | "Product"
  | "Lifestyle"
  | "Craftsmanship"
  | "Education"
  | "Brand story"
  | "Community";

export type ProductFamily =
  | "Placemats"
  | "Trivets"
  | "Coasters"
  | "Table Runner"
  | "Round Bowls"
  | "Oval Bowls"
  | "Planters"
  | "Clip-On Hangers"
  | "Baskets"
  | "Carrier Bags";

export type Status =
  | "idea"
  | "media"
  | "editing"
  | "review"
  | "approved"
  | "scheduled"
  | "posted";

export type Music = "royalty-free" | "instagram" | "none";

export interface Idea {
  id: string;
  format: Format;
  pillar: Pillar;
  product?: ProductFamily;
  title: string;
  /** One-line brief: what the post is about. */
  prompt: string;
  /** What to film or photograph. */
  shots: string[];
  caption: string;
  hashtags: string[];
  cta: string;
  /** Months (1-12) this idea suits. Empty or missing = any time of year. */
  months?: number[];
}

export interface MediaRef {
  id: string;
  source: "drive" | "local";
  name: string;
  mimeType: string;
  thumbnail?: string;
  link?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface Slot {
  id: string;
  /** ISO date, YYYY-MM-DD, local (Africa/Johannesburg) calendar day. */
  date: string;
  /** HH:MM, local time. */
  time: string;
  format: Format;
  ideaId: string;
  pillar: Pillar;
  product?: ProductFamily;
  title: string;
  prompt: string;
  shots: string[];
  caption: string;
  hashtags: string[];
  cta: string;
  status: Status;
  locked: boolean;
  media: MediaRef[];
  music: Music;
  askClaude: boolean;
  notes: string;
  updatedAt: string;
  /** Set by a scheduled Claude run when it answers "Ask Claude" or refreshes a caption. */
  claude?: ClaudeReply;
  /** Reels: the edit plan the reel editor renders. */
  storyboard?: Storyboard;
  /** Reels: the last finished render saved to Drive. */
  render?: ReelRender;
  /** Set when the post is handed to the publisher (status "scheduled"). */
  publish?: Publish;
  /** A Canva design to bring in at a set size (exported by Claude's scheduled run). */
  canva?: CanvaRequest;
  /** Claude's look at the post's media against the brand (fonts, text, colours). */
  brandCheck?: BrandCheck;
  /** Where the guided post flow is up to. Missing on slots made before the flow. */
  step?: FlowStep;
  /** The song for this post: one from the music folder (baked in) or one saved on Instagram (added by hand). */
  song?: Song;
  /** The Canva design pulled into this post through the Canva browser. */
  canvaDesign?: { id: string; title: string; pages: number };
  /** Why the time was suggested, shown next to it. */
  timeWhy?: string;
  /** Shot list items ticked to include (by index into `shots`). Missing = all. */
  shotsChosen?: number[];
  /** The photos a B-roll video replaced, so "Keep the photos instead" can put them back. */
  stillMedia?: MediaRef[];
  /** Caption options Claude wrote for this post when asked, to pick from in the flow. */
  captionOptions?: string[];
}

/**
 * The guided steps for making a post. `canva` asks whether to pull a design
 * from Canva first; a Canva design then skips straight to `heading`.
 */
export type FlowStep = "canva" | "idea" | "heading" | "shots" | "media" | "broll" | "music" | "words" | "time" | "preview" | "done";

export interface Song {
  title: string;
  /** library: a track file in the "Roopip music" Drive folder, baked into the video so it can auto-post.
   *  instagram: a song saved on Instagram; the app reminds whoever posts it by hand to add it. */
  source: "library" | "instagram";
  driveId?: string;
  /** Set once the song is baked into the post's video. */
  bakedInto?: string;
}

export type CanvaSize = "story" | "grid" | "reel";

export interface CanvaRequest {
  /** The Canva share or edit link someone pasted. */
  link: string;
  size: CanvaSize;
  requestedAt: string;
  /**
   * requested: waiting for Claude's next run. exported: files are ready to add
   * (the links work for about a day). added: the files are on the post.
   * failed: see error.
   */
  status: "requested" | "exported" | "added" | "failed";
  /** Canva download links, one per page (or one video). */
  files?: { url: string; type: "image" | "video" }[];
  exportedAt?: string;
  addedAt?: string;
  error?: string;
}

export interface BrandCheck {
  at: string;
  /** True when Claude found nothing off-brand. */
  ok: boolean;
  /** Plain-language notes, e.g. "The text uses a script font, not Cormorant Garamond." */
  notes: string[];
  /** The media ids Claude looked at. A change to the post's media makes the check stale. */
  mediaIds: string[];
}

export interface OutboxFile {
  /** Object key in the R2 outbox. */
  key: string;
  /** Public URL Meta fetches the file from. */
  url: string;
  type: "image" | "video";
}

/** Progress of one post through the publisher. */
export interface Publish {
  files: OutboxFile[];
  queuedAt: string;
  queuedBy?: string;
  ig?: { containerId?: string; mediaId?: string; permalink?: string; frames?: { containerId?: string; mediaId?: string }[] };
  /** Engagement Instagram reported for the post, read by the publisher once a day for 2 weeks. */
  stats?: { reach?: number; interactions?: number; saves?: number; shares?: number; at: string };
  fb?: { postId?: string; skipped?: string };
  attempts?: number;
  error?: string;
  postedAt?: string;
}

/** One cut in a reel. Times are in seconds of the source clip. */
export interface ReelShot {
  /** A MediaRef id from the slot's media. */
  mediaId: string;
  /** Where to start in a video. Ignored for photos. */
  start: number;
  /** How long the shot lasts in the finished reel. */
  duration: number;
  /** 1 = normal, 0.5 = half-speed slow motion. Videos only. */
  speed: number;
  /** On-screen words for this shot, short. */
  text?: string;
}

export interface Storyboard {
  shots: ReelShot[];
  /** Branded end card: Roopip on warm ivory. */
  endCard: boolean;
  /** Line under the name on the end card. */
  endText?: string;
  grade: "warm" | "natural";
  /** Who last set it up. */
  by: "auto" | "claude" | "person";
}

export interface ReelRender {
  at: string;
  seconds: number;
  name: string;
  driveId?: string;
  link?: string;
}

/** The slot fields Claude may change. Kept so its changes can be undone. */
export type ClaudeFields = Pick<Slot, "title" | "prompt" | "shots" | "caption" | "hashtags" | "cta" | "storyboard">;

export interface ClaudeReply {
  /** ISO time of the run. */
  at: string;
  /** What Claude did, in a sentence or two, for the person reading the slot. */
  note: string;
  /** The slot's fields before Claude changed them. Missing when Claude changed nothing. */
  previous?: Partial<ClaudeFields>;
}

export interface TemplateSlot {
  /** 1 = Monday … 7 = Sunday */
  dow: number;
  kind: SlotKind;
  time: string;
  optional?: boolean;
}
