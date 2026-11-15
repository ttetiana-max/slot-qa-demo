// Wallet & bet rules: money must never be created or lost by mistake.
import { createSession, getSession, spin } from '../../support/api';
import { spec } from '../../support/gameSpec';

describe('Wallet and bets API', () => {
  it('a new session starts with the default balance and nonce 0', () => {
    createSession().then((session) => {
      expect(session.balance).to.eq(spec.startingBalance);
      expect(session.nonce).to.eq(0);
    });
  });

  it('a spin debits the bet and credits the win', () => {
    createSession().then((session) => {
      spin(session.sessionId, 10).then(({ status, body }) => {
        expect(status).to.eq(200);
        expect(body.win).to.eq(10 * body.multiplier);
        expect(body.balance).to.eq(session.balance - 10 + body.win);
      });
    });
  });

  it('balance stays consistent over many spins', () => {
    const BET = 5;
    createSession().then((session) => {
      let expectedBalance = session.balance;
      Cypress._.times(30, () => {
        spin(session.sessionId, BET).then(({ body }) => {
          expectedBalance = expectedBalance - BET + body.win;
          expect(body.balance).to.eq(expectedBalance);
        });
      });
      // The stored balance must match what we calculated from every single spin.
      cy.then(() => getSession(session.sessionId).then((s) => expect(s.balance).to.eq(expectedBalance)));
    });
  });

  it('the nonce increases by exactly 1 per spin', () => {
    createSession().then((session) => {
      Cypress._.times(5, (i) => {
        spin(session.sessionId, 1).its('body.nonce').should('eq', i);
      });
      getSession(session.sessionId).its('nonce').should('eq', 5);
    });
  });

  // Boundary values and wrong types. Each one must be rejected without touching the balance.
  const invalidBets: unknown[] = [spec.minBet - 1, -5, spec.maxBet + 1, 2.5, '10', null, 1e9];
  invalidBets.forEach((bet) => {
    it(`rejects invalid bet ${JSON.stringify(bet)} and keeps the balance`, () => {
      createSession().then((session) => {
        spin(session.sessionId, bet).then(({ status, body }) => {
          expect(status).to.eq(400);
          expect(body.error).to.eq('INVALID_BET');
        });
        getSession(session.sessionId).then((after) => {
          expect(after.balance).to.eq(session.balance);
          expect(after.nonce).to.eq(0);
        });
      });
    });
  });

  it('accepts the minimum and maximum bet', () => {
    createSession().then((session) => {
      spin(session.sessionId, spec.minBet).its('status').should('eq', 200);
      spin(session.sessionId, spec.maxBet).its('status').should('eq', 200);
    });
  });

  it('rejects a bet larger than the balance', () => {
    createSession(3).then((session) => {
      spin(session.sessionId, 5).then(({ status, body }) => {
        expect(status).to.eq(400);
        expect(body.error).to.eq('INSUFFICIENT_FUNDS');
      });
      getSession(session.sessionId).its('balance').should('eq', 3);
    });
  });

  it('allows betting the entire balance', () => {
    createSession(5).then((session) => {
      spin(session.sessionId, 5).then(({ status, body }) => {
        expect(status).to.eq(200);
        expect(body.balance).to.eq(body.win); // 5 - 5 + win
      });
    });
  });

  it('rejects an empty or too long client seed', () => {
    createSession().then((session) => {
      ['', 'x'.repeat(65), 42].forEach((clientSeed) => {
        spin(session.sessionId, 1, clientSeed).its('body.error').should('eq', 'INVALID_CLIENT_SEED');
      });
    });
  });

  it('returns 404 for an unknown session', () => {
    spin('does-not-exist', 1).then(({ status, body }) => {
      expect(status).to.eq(404);
      expect(body.error).to.eq('SESSION_NOT_FOUND');
    });
  });

  it('returns 400 for a malformed JSON body', () => {
    createSession().then((session) => {
      cy.request({
        method: 'POST',
        url: `/api/sessions/${session.sessionId}/spin`,
        headers: { 'Content-Type': 'application/json' },
        body: '{"bet": 10,',
        failOnStatusCode: false,
      }).then(({ status, body }) => {
        expect(status).to.eq(400);
        expect(body.error).to.eq('INVALID_JSON');
      });
    });
  });
});
