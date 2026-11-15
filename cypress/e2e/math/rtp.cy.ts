// Statistical checks: play a million spins through the real outcome generator and compare
// the results with the math model. A random result will never hit the RTP exactly, so the
// tolerance is calculated from the game's variance (standard error), not guessed.
import { spec, specVariance, totalWeight } from '../../support/gameSpec';

interface SimulationResult {
  spins: number;
  serverSeed: string;
  rtp: number;
  symbolCounts: Record<string, number>[];
}

// Can be lowered for a quick run: npx cypress run --env RTP_SPINS=200000
const SPINS = Number(Cypress.env('RTP_SPINS') ?? 1_000_000);
// 4 standard deviations: a correct game fails this check less than once in ~15,000 runs.
const SIGMAS = 4;

describe('Game math: RTP and symbol distribution (simulation)', () => {
  let sim: SimulationResult;

  before(() => {
    cy.task<SimulationResult>('simulate', { spins: SPINS }, { timeout: 10 * 60 * 1000 }).then((result) => {
      sim = result;
      // Logged so that a failing run can be reproduced with the same seed.
      cy.log(`Simulation server seed: ${result.serverSeed}`);
    });
  });

  it(`simulated RTP is within ${SIGMAS} sigma of the declared RTP`, () => {
    const standardError = Math.sqrt(specVariance() / SPINS);
    const tolerance = SIGMAS * standardError;
    cy.log(
      `RTP simulated ${(sim.rtp * 100).toFixed(3)}%, declared ${(spec.declaredRtp * 100).toFixed(3)}%, ` +
        `allowed ±${(tolerance * 100).toFixed(3)}%`,
    );
    expect(sim.rtp).to.be.closeTo(spec.declaredRtp, tolerance);
  });

  it('each symbol lands with its expected frequency on every reel', () => {
    sim.symbolCounts.forEach((counts, reel) => {
      spec.reel.forEach(({ id, weight }) => {
        const p = weight / totalWeight;
        const expected = SPINS * p;
        const standardDeviation = Math.sqrt(SPINS * p * (1 - p));
        expect(counts[id], `reel ${reel + 1}, ${id}`).to.be.closeTo(expected, SIGMAS * standardDeviation);
      });
    });
  });
});
