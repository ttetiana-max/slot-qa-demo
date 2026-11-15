import { defineConfig } from 'cypress';
import { DECLARED_RTP, PAYTABLE, REEL, SymbolId } from './src/game/config';
import { payoutMultiplier, simulate, theoreticalRtp, theoreticalVariance } from './src/game/slot';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    video: false,
    setupNodeEvents(on) {
      // Tasks run in Node (not in the browser), so they can call the game math code directly
      // and run heavy simulations quickly.
      on('task', {
        gameModel() {
          return {
            reel: REEL,
            paytable: PAYTABLE,
            declaredRtp: DECLARED_RTP,
            theoreticalRtp: theoreticalRtp(),
            variance: theoreticalVariance(),
          };
        },
        payoutMultipliers(combinations: SymbolId[][]) {
          return combinations.map((symbols) => payoutMultiplier(symbols));
        },
        simulate({ spins }: { spins: number }) {
          return simulate(spins);
        },
      });
    },
  },
});
