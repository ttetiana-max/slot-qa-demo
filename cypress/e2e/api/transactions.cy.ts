// Data layer: the number on the screen is not enough. After every spin there must be exactly one
// transaction record with the bet, the win and the round ID, and the records must add up.
// Here the "database" is the server's transaction history (GET /api/sessions/:id/transactions);
// in a real project the same checks would run as SQL queries against the transactions table.
import { createSession, getSession, getTransactions, rotateSeed, spin } from '../../support/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Transaction history (data layer)', () => {
  it('a new session has no transactions', () => {
    createSession().then((session) => {
      getTransactions(session.sessionId).should('deep.equal', []);
    });
  });

  it('each spin writes exactly one record that matches the spin response', () => {
    createSession(1000).then((session) => {
      Cypress._.times(5, (i) => {
        spin(session.sessionId, 10).then(({ body: result }) => {
          getTransactions(session.sessionId).then((transactions) => {
            expect(transactions, 'one record per spin').to.have.length(i + 1);
            const record = transactions[i];
            expect(record.roundId).to.match(UUID);
            expect(record).to.include({
              roundId: result.roundId,
              sessionId: session.sessionId,
              nonce: result.nonce,
              clientSeed: result.clientSeed,
              serverSeedHash: result.serverSeedHash,
              bet: 10,
              multiplier: result.multiplier,
              win: result.win,
              balanceAfter: result.balance,
            });
            expect(record.symbols).to.deep.eq(result.symbols);
            expect(record.balanceAfter).to.eq(record.balanceBefore - record.bet + record.win);
            expect(Date.parse(record.createdAt), 'createdAt is a valid date').not.to.be.NaN;
          });
        });
      });
    });
  });

  it('the records form an unbroken chain from the starting balance to the current balance', () => {
    const START = 500;
    createSession(START).then((session) => {
      Cypress._.times(20, () => spin(session.sessionId, 5));

      getTransactions(session.sessionId).then((transactions) => {
        expect(transactions).to.have.length(20);
        expect(transactions[0].balanceBefore, 'first record starts at the starting balance').to.eq(START);
        transactions.slice(1).forEach((t, i) => {
          expect(t.balanceBefore, `record ${i + 2} continues from record ${i + 1}`).to.eq(transactions[i].balanceAfter);
        });
        const expectedBalance = START - Cypress._.sumBy(transactions, 'bet') + Cypress._.sumBy(transactions, 'win');
        expect(transactions[19].balanceAfter).to.eq(expectedBalance);
        getSession(session.sessionId).its('balance').should('eq', expectedBalance);
      });
    });
  });

  it('every round ID is unique, also after the seed is rotated and the nonce restarts', () => {
    createSession().then((session) => {
      Cypress._.times(5, () => spin(session.sessionId, 1));
      rotateSeed(session.sessionId);
      Cypress._.times(5, () => spin(session.sessionId, 1));

      getTransactions(session.sessionId).then((transactions) => {
        expect(transactions).to.have.length(10);
        expect(new Set(transactions.map((t) => t.roundId)).size, 'unique round IDs').to.eq(10);
        expect(transactions.map((t) => t.nonce)).to.deep.eq([0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
        expect(transactions[5].serverSeedHash, 'new seed after rotation').not.to.eq(transactions[0].serverSeedHash);
      });
    });
  });

  it('rejected spins do not write any record', () => {
    createSession(5).then((session) => {
      spin(session.sessionId, 0).its('status').should('eq', 400); // INVALID_BET
      spin(session.sessionId, 1.5).its('status').should('eq', 400); // INVALID_BET
      spin(session.sessionId, 1, '').its('status').should('eq', 400); // INVALID_CLIENT_SEED
      spin(session.sessionId, 6).its('status').should('eq', 400); // INSUFFICIENT_FUNDS
      getTransactions(session.sessionId).should('deep.equal', []);
      getSession(session.sessionId).its('balance').should('eq', 5);
    });
  });

  it('a spin made in the UI is recorded with the same values the player sees', () => {
    cy.visit('/');
    cy.window().its('__gameState.ready').should('eq', true);
    cy.get('[data-cy=bet-input]').clear().type('7');
    cy.get('[data-cy=spin-button]').click();

    cy.window()
      .its('__gameState')
      .should((state) => expect(state.lastResult).not.to.be.null)
      .then((state) => {
        const result = state.lastResult!;
        getTransactions(state.sessionId!).then((transactions) => {
          expect(transactions).to.have.length(1);
          expect(transactions[0]).to.include({ roundId: result.roundId, bet: 7, win: result.win });
          cy.get('[data-cy=balance]').should('have.text', String(transactions[0].balanceAfter));
        });
      });
  });
});
