import { PAYTABLE, REEL, REEL_COUNT, TOTAL_WEIGHT, SymbolId } from './config';
import { generateServerSeed, outcomeFromSeeds } from './provablyFair';

/** Payout multiplier for a spin result: three of a kind pays the paytable value, anything else pays 0. */
export function payoutMultiplier(symbols: SymbolId[]): number {
  if (symbols.length !== REEL_COUNT) throw new Error(`Expected ${REEL_COUNT} symbols, got ${symbols.length}`);
  const first = symbols[0];
  return symbols.every((s) => s === first) ? PAYTABLE[first] : 0;
}

const threeOfAKindProbability = (weight: number) => (weight / TOTAL_WEIGHT) ** REEL_COUNT;

/** Exact RTP of the math model: sum over symbols of P(three of a kind) * multiplier. */
export function theoreticalRtp(): number {
  return REEL.reduce((sum, s) => sum + threeOfAKindProbability(s.weight) * PAYTABLE[s.id], 0);
}

/** Variance of the win per 1 unit bet. Used to decide how far a simulation may drift from the RTP. */
export function theoreticalVariance(): number {
  const meanOfSquares = REEL.reduce((sum, s) => sum + threeOfAKindProbability(s.weight) * PAYTABLE[s.id] ** 2, 0);
  return meanOfSquares - theoreticalRtp() ** 2;
}

export interface SimulationResult {
  spins: number;
  serverSeed: string;
  clientSeed: string;
  totalWin: number;
  rtp: number;
  /** symbolCounts[reelIndex][symbolId] = how many times the symbol landed on that reel */
  symbolCounts: Record<SymbolId, number>[];
}

/** Plays `spins` rounds with bet = 1 through the real outcome generator and collects statistics. */
export function simulate(spins: number, serverSeed = generateServerSeed(), clientSeed = 'simulation'): SimulationResult {
  const symbolCounts = Array.from(
    { length: REEL_COUNT },
    () => Object.fromEntries(REEL.map((s) => [s.id, 0])) as Record<SymbolId, number>,
  );
  let totalWin = 0;
  for (let nonce = 0; nonce < spins; nonce++) {
    const symbols = outcomeFromSeeds(serverSeed, clientSeed, nonce);
    symbols.forEach((symbol, reel) => symbolCounts[reel][symbol]++);
    totalWin += payoutMultiplier(symbols);
  }
  return { spins, serverSeed, clientSeed, totalWin, rtp: totalWin / spins, symbolCounts };
}
