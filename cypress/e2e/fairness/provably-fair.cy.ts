// Provably fair: the player must be able to prove that results were not changed after the bet.
import { createSession, getSession, rotateSeed, spin, SpinResult } from '../../support/api';
import { recomputeOutcome, sha256Hex } from '../../support/fairnessVerifier';

describe('Provably fair outcomes', () => {
  it('shows only the hash of the server seed, never the seed itself', () => {
    createSession().then((session) => {
      expect(session.serverSeedHash).to.match(/^[0-9a-f]{64}$/);
      expect(session).not.to.have.property('serverSeed');
      getSession(session.sessionId).should('not.have.property', 'serverSeed');
    });
  });

  it('the hash stays the same for every spin until the seed is rotated', () => {
    createSession().then((session) => {
      Cypress._.times(5, () => {
        spin(session.sessionId, 1).its('body.serverSeedHash').should('eq', session.serverSeedHash);
      });
    });
  });

  it('every result can be re-computed by the player after the seed is revealed', () => {
    const clientSeed = `player-${Date.now()}`;
    const results: SpinResult[] = [];

    createSession().then((session) => {
      Cypress._.times(25, () => {
        spin(session.sessionId, 1, clientSeed).then(({ body }) => results.push(body));
      });

      rotateSeed(session.sessionId).then(({ revealedServerSeed, previousServerSeedHash }) => {
        // 1. The revealed seed is the one the server committed to before the spins.
        expect(previousServerSeedHash).to.eq(session.serverSeedHash);
        cy.wrap(sha256Hex(revealedServerSeed)).should('eq', session.serverSeedHash);

        // 2. Each result is re-computed with our own independent verifier.
        results.forEach((result) => {
          cy.wrap(recomputeOutcome(revealedServerSeed, clientSeed, result.nonce)).should('deep.equal', result.symbols);
        });
      });
    });
  });

  it('rotating the seed starts a new commitment and resets the nonce', () => {
    createSession().then((session) => {
      spin(session.sessionId, 1);
      rotateSeed(session.sessionId).then((rotated) => {
        expect(rotated.serverSeedHash).to.match(/^[0-9a-f]{64}$/);
        expect(rotated.serverSeedHash).not.to.eq(session.serverSeedHash);
        expect(rotated.nonce).to.eq(0);
      });
    });
  });
});
