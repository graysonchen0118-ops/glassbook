export type Sport = "football" | "basketball" | "tennis" | "hockey" | "fight";

export interface Ev {
  id: string;
  sport: Sport;
  league: string;
  home: string;
  away: string;
  startsAt: number;
  venue: string;
  photo: string;
  /** final score, only once the event has finished */
  score?: string;
  endedAt?: number;
  void?: boolean;
}

export type MarketKind = "1x2" | "ou" | "btts" | "ml" | "total" | "winner" | "games" | "distance";

export interface Selection {
  id: string;
  label: string;
  odds: number;
}

export interface Market {
  id: string;
  eventId: string;
  kind: MarketKind;
  name: string;
  selections: Selection[];
  /** the most this market may ever owe on one outcome, in USDT */
  ceiling: number;
  paused: boolean;
  draft: boolean;
  createdAt: number;
}

export type BetStatus = "locked" | "won" | "lost" | "void" | "claimed";

export interface Bet {
  id: string;
  wallet: string;
  eventId: string;
  marketId: string;
  selectionId: string;
  odds: number;
  stake: number;
  placedAt: number;
  block: number;
  tx: string;
  status: BetStatus;
  bot?: boolean;
}

export type ResultState = "window" | "disputed" | "final";

export interface Result {
  eventId: string;
  score: string;
  /** which selection won, per market */
  outcome: Record<string, string>;
  signer: string;
  sig: string;
  signedAt: number;
  windowEnds: number;
  state: ResultState;
  /** what the second source says, used when a dispute is reviewed */
  second: string;
  corrected?: boolean;
}

export type DisputeState = "review" | "rejected" | "upheld";

export interface Dispute {
  id: string;
  eventId: string;
  wallet: string;
  reason: string;
  note: string;
  at: number;
  state: DisputeState;
  answer?: string;
}

export type LogKind = "bet" | "refused" | "pause" | "resume" | "odds" | "ceiling" | "settle" | "dispute" | "market" | "claim" | "lock";

export interface LogLine {
  id: string;
  at: number;
  kind: LogKind;
  text: string;
}

export interface SlipLine {
  marketId: string;
  selectionId: string;
  stake: string;
}

export type Tone = "ok" | "error" | "info";
export interface Toast {
  id: number;
  tone: Tone;
  text: string;
}
