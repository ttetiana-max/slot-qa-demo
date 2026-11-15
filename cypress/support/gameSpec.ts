// Independent "oracle": expected behaviour calculated from the spec fixture,
// without using any of the game's own code. If the game and the spec disagree, a test fails.
import spec from '../fixtures/game-spec.json';

export { spec };

const paytable = spec.paytable as Record<string, number>;

export const totalWeight = spec.reel.reduce((sum, s) => sum + s.weight, 0);

/** Expected payout multiplier for a combination, according to the spec. */
export function expectedMultiplier(symbols: string[]): number {
  const first = symbols[0];
  const threeOfAKind = symbols.length === spec.reelCount && symbols.every((s) => s === first);
  return threeOfAKind ? paytable[first] : 0;
}

const threeOfAKindProbability = (weight: number) => (weight / totalWeight) ** spec.reelCount;

/** RTP calculated from the spec's reel weights and paytable. */
export function specRtp(): number {
  return spec.reel.reduce((sum, s) => sum + threeOfAKindProbability(s.weight) * paytable[s.id], 0);
}

/** Variance of the win per 1 unit bet (needed to choose a fair tolerance for simulations). */
export function specVariance(): number {
  const meanOfSquares = spec.reel.reduce((sum, s) => sum + threeOfAKindProbability(s.weight) * paytable[s.id] ** 2, 0);
  return meanOfSquares - specRtp() ** 2;
}
