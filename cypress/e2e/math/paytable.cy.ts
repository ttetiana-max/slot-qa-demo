// Paytable and math model: the game must pay exactly what the math team specified.
import { createSession, spin } from '../../support/api';
import { expectedMultiplier, spec, specRtp } from '../../support/gameSpec';

interface GameModel {
  reel: { id: string; weight: number }[];
  paytable: Record<string, number>;
  declaredRtp: number;
  theoreticalRtp: number;
}

describe('Game math: paytable and model', () => {
  it('game configuration matches the math team spec', () => {
    cy.task<GameModel>('gameModel').then((model) => {
      expect(model.reel, 'reel weights').to.deep.eq(spec.reel);
      expect(model.paytable, 'paytable').to.deep.eq(spec.paytable);
      expect(model.declaredRtp, 'declared RTP').to.eq(spec.declaredRtp);
    });
  });

  it('the declared RTP is what the reel weights and paytable actually produce', () => {
    // Calculated independently from the spec...
    expect(specRtp()).to.be.closeTo(spec.declaredRtp, 1e-12);
    // ...and by the game itself.
    cy.task<GameModel>('gameModel').its('theoreticalRtp').should('be.closeTo', spec.declaredRtp, 1e-12);
  });

  it('every one of the 125 combinations pays according to the paytable', () => {
    const ids = spec.reel.map((s) => s.id);
    const combinations = ids.flatMap((a) => ids.flatMap((b) => ids.map((c) => [a, b, c])));
    expect(combinations).to.have.length(125);

    cy.task<number[]>('payoutMultipliers', combinations).then((actual) => {
      combinations.forEach((combo, i) => {
        expect(actual[i], combo.join(' | ')).to.eq(expectedMultiplier(combo));
      });
    });
  });

  it('wins returned by the API always match the paytable', () => {
    const BET = 10;
    createSession(100000).then((session) => {
      Cypress._.times(100, () => {
        spin(session.sessionId, BET).then(({ body }) => {
          const expected = expectedMultiplier(body.symbols);
          expect(body.multiplier, body.symbols.join(' | ')).to.eq(expected);
          expect(body.win).to.eq(BET * expected);
        });
      });
    });
  });
});
