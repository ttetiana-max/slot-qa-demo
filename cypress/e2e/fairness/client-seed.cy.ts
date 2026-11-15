// Client seed: the player's own input to the random result.
// Important detail: changing the client seed must NOT change the server seed hash. The hash is
// the server's promise, made before the bets, and it may only change when the seed is rotated.
// What the client seed changes is the result: every spin must equal
// HMAC-SHA256(serverSeed, clientSeed:nonce) for the exact client seed the player typed.
import { createSession, getTransactions, rotateSeed, spin, SpinResult } from '../../support/api';
import { recomputeOutcome } from '../../support/fairnessVerifier';

const gameState = () => cy.window().its('__gameState');

describe('Client seed', () => {
  describe('in the UI', () => {
    beforeEach(() => {
      cy.visit('/');
      gameState().its('ready').should('eq', true);
    });

    it('the client seed typed by the player is the one sent to the server and used for the spin', () => {
      cy.intercept('POST', '/api/sessions/*/spin').as('spin');
      cy.get('[data-cy=client-seed-input]').clear().type('my-lucky-seed');
      cy.get('[data-cy=spin-button]').click();

      cy.wait('@spin').then(({ request, response }) => {
        expect(request.body.clientSeed, 'sent to the server').to.eq('my-lucky-seed');
        expect(response!.body.clientSeed, 'used by the server').to.eq('my-lucky-seed');
      });
    });

    it('changing the client seed does not change the server seed hash, but the nonce keeps counting', () => {
      cy.get('[data-cy=server-seed-hash]')
        .invoke('text')
        .then((hashBefore) => {
          ['first-seed', 'second-seed', 'third-seed'].forEach((seed, i) => {
            cy.get('[data-cy=client-seed-input]').clear().type(seed);
            cy.get('[data-cy=spin-button]').click();
            cy.get('[data-cy=nonce]').should('have.text', String(i + 1));
            cy.get('[data-cy=server-seed-hash]').should('have.text', hashBefore);
          });
        });
    });

    it('spins with different client seeds can each be verified after the seed is revealed', () => {
      const seeds = ['alpha', 'beta', 'gamma', 'delta'];
      const results: { symbols: string[]; nonce: number; clientSeed: string }[] = [];

      seeds.forEach((seed, i) => {
        cy.get('[data-cy=client-seed-input]').clear().type(seed);
        cy.get('[data-cy=spin-button]').click();
        gameState()
          .its('lastResult.nonce')
          .should('eq', i)
          .then(() => gameState().its('lastResult').then((r) => results.push(r!)));
      });

      gameState()
        .its('sessionId')
        .then((sessionId) => {
          rotateSeed(sessionId!).then(({ revealedServerSeed }) => {
            results.forEach((r, i) => {
              expect(r.clientSeed).to.eq(seeds[i]);
              cy.wrap(recomputeOutcome(revealedServerSeed, r.clientSeed, r.nonce)).should('deep.equal', r.symbols);
            });
          });
        });
    });

    it('an empty client seed shows a clear error and does not take the bet', () => {
      cy.get('[data-cy=balance]')
        .invoke('text')
        .then((balanceBefore) => {
          cy.get('[data-cy=client-seed-input]').clear();
          cy.get('[data-cy=spin-button]').click();
          cy.get('[data-cy=error]').should('have.text', 'Client seed must be 1-64 characters');
          cy.get('[data-cy=balance]').should('have.text', balanceBefore);
          cy.get('[data-cy=nonce]').should('have.text', '0');
          gameState()
            .its('sessionId')
            .then((sessionId) => getTransactions(sessionId!).should('have.length', 0));
        });
    });

    it('a client seed of 65 characters is rejected, 64 characters is accepted', () => {
      cy.get('[data-cy=client-seed-input]').clear().type('x'.repeat(65), { delay: 0 });
      cy.get('[data-cy=spin-button]').click();
      cy.get('[data-cy=error]').should('have.text', 'Client seed must be 1-64 characters');
      cy.get('[data-cy=nonce]').should('have.text', '0');

      cy.get('[data-cy=client-seed-input]').clear().type('x'.repeat(64), { delay: 0 });
      cy.get('[data-cy=spin-button]').click();
      cy.get('[data-cy=error]').should('have.text', '');
      cy.get('[data-cy=nonce]').should('have.text', '1');
    });
  });

  describe('in the API', () => {
    it('the result really depends on the client seed', () => {
      // Recomputing a spin with a DIFFERENT client seed must give a different result for most spins.
      // A single spin can match by chance (about 1.5%), so we check 20 spins: if the client seed
      // were ignored, all 20 would match. We allow fewer than 10 chance matches; the chance that a
      // correct game fails this is about 1 in 10 trillion.
      const results: SpinResult[] = [];
      createSession().then((session) => {
        Cypress._.times(20, (i) => spin(session.sessionId, 1, `seed-${i}`).then(({ body }) => results.push(body)));

        rotateSeed(session.sessionId).then(({ revealedServerSeed }) => {
          const checks = results.map(async (r) => {
            const withOwnSeed = await recomputeOutcome(revealedServerSeed, r.clientSeed, r.nonce);
            const withOtherSeed = await recomputeOutcome(revealedServerSeed, `${r.clientSeed}-other`, r.nonce);
            return { ownMatches: Cypress._.isEqual(withOwnSeed, r.symbols), otherMatches: Cypress._.isEqual(withOtherSeed, r.symbols) };
          });
          cy.wrap(Promise.all(checks)).then((outcomes) => {
            const list = outcomes as { ownMatches: boolean; otherMatches: boolean }[];
            expect(list.every((o) => o.ownMatches), 'every spin matches its own client seed').to.eq(true);
            expect(list.filter((o) => o.otherMatches).length, 'spins that match a different seed').to.be.lessThan(10);
          });
        });
      });
    });
  });
});
