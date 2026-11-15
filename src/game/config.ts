// Game configuration ("math model") of a simple 3-reel slot.
// In a real studio this comes from the game math team.

export type SymbolId = 'CHERRY' | 'LEMON' | 'BELL' | 'STAR' | 'SEVEN';

export interface ReelSymbol {
  id: SymbolId;
  /** How many "stops" this symbol occupies on the reel. Higher = more frequent. */
  weight: number;
}

/** Every reel uses the same weighted strip. Total weight = 20. */
export const REEL: ReelSymbol[] = [
  { id: 'CHERRY', weight: 6 },
  { id: 'LEMON', weight: 6 },
  { id: 'BELL', weight: 4 },
  { id: 'STAR', weight: 3 },
  { id: 'SEVEN', weight: 1 },
];

export const REEL_COUNT = 3;
export const TOTAL_WEIGHT = REEL.reduce((sum, s) => sum + s.weight, 0);

/** Payout multiplier (x bet) for three of a kind. Any other combination pays 0. */
export const PAYTABLE: Record<SymbolId, number> = {
  CHERRY: 10,
  LEMON: 10,
  BELL: 25,
  STAR: 50,
  SEVEN: 400,
};

/** RTP the studio advertises for this game (95.875%). */
export const DECLARED_RTP = 0.95875;

export const MIN_BET = 1;
export const MAX_BET = 100;
export const STARTING_BALANCE = 1000;
