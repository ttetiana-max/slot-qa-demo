// Loaded before every spec file.

/** Shape of the test hook the game exposes on window (see public/app.js). */
export interface GameState {
  ready: boolean;
  sessionId: string | null;
  balance: number;
  serverSeedHash: string | null;
  nonce: number;
  lastResult: {
    roundId: string;
    symbols: string[];
    bet: number;
    multiplier: number;
    win: number;
    balance: number;
    nonce: number;
    clientSeed: string;
    serverSeedHash: string;
  } | null;
}

declare global {
  interface Window {
    __gameState: GameState;
  }
}
