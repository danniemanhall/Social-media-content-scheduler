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
}

/** The slot fields Claude may change. Kept so its changes can be undone. */
export type ClaudeFields = Pick<Slot, "title" | "prompt" | "shots" | "caption" | "hashtags" | "cta">;

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
