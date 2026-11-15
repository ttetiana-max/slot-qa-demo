// A series of real spins through the REST API (cy.request), not through the UI.
// It checks the money exactly, spin by spin, and checks the RTP with a tolerance that is
// calculated for this number of spins.
//
// Why not "RTP must be between 95% and 97%"? Slot results are very spread out: the standard
// deviation of one spin here is about 6.2 bets. After 100 spins the RTP can honestly be anywhere
// from about 0% to 220%, so a fixed 95-97% range would fail most of the time on a correct game.
// To get a +/-1% range at 4 sigma you need about 6 million spins (see rtp.cy.ts, which runs a
// simulation in Node for that). Every check below has one clear outcome: it passes only if the
// game is correct.
import { createSession, getSession } from '../../support/api';
import { expectedMultiplier, spec, specVariance } from '../../support/gameSpec';

interface SpinBody {
  symbols: string[];
  bet: number;
  multiplier: number;
  win: number;
  balance: number;
}

const SPINS = Number(Cypress.env('SERIES_SPINS') ?? 1000);
const BET = 1;
const INITIAL_BALANCE = 100_000;
const SIGMAS = 4;

describe(`Game math: a series of ${SPINS} spins through the API`, () => {
  let sessionId: string;
  const spins: SpinBody[] = [];

  before(() => {
    createSession(INITIAL_BALANCE).then((session) => {
      sessionId = session.sessionId;
      Cypress._.times(SPINS, () => {
        cy.request<SpinBody>({
          method: 'POST',
          url: `/api/sessions/${sessionId}/spin`,
          body: { bet: BET, clientSeed: 'series-seed' },
          log: false, // 1000 lines in the command log would hide the assertions
        }).then(({ body }) => spins.push(body));
      });
    });
  });

  it('every spin is accepted and pays exactly what the paytable says', () => {
    expect(spins).to.have.length(SPINS);
    spins.forEach((s, i) => {
      const expected = expectedMultiplier(s.symbols);
      expect(s.multiplier, `spin ${i + 1}: ${s.symbols.join(' | ')}`).to.eq(expected);
      expect(s.win, `spin ${i + 1} win`).to.eq(BET * expected);
    });
  });

  it('the balance after every spin is the previous balance minus the bet plus the win', () => {
    let balance = INITIAL_BALANCE;
    spins.forEach((s, i) => {
      balance = balance - s.bet + s.win;
      expect(s.balance, `balance after spin ${i + 1}`).to.eq(balance);
    });
  });

  it('the final balance equals start - total bets + total wins', () => {
    const totalBet = Cypress._.sumBy(spins, 'bet');
    const totalWin = Cypress._.sumBy(spins, 'win');
    expect(totalBet).to.eq(SPINS * BET);
    getSession(sessionId).its('balance').should('eq', INITIAL_BALANCE - totalBet + totalWin);
  });

  it(`the observed RTP is within ${SIGMAS} sigma for ${SPINS} spins`, () => {
    const totalWin = Cypress._.sumBy(spins, 'win');
    const rtp = totalWin / (SPINS * BET);
    const tolerance = SIGMAS * Math.sqrt(specVariance() / SPINS);
    const spinsForOnePercent = Math.ceil(specVariance() * (SIGMAS / 0.01) ** 2);
    cy.log(
      `RTP over ${SPINS} spins: ${(rtp * 100).toFixed(2)}%, declared ${(spec.declaredRtp * 100).toFixed(3)}%, ` +
        `allowed ±${(tolerance * 100).toFixed(1)}%`,
    );
    cy.log(`A ±1% range would need about ${spinsForOnePercent.toLocaleString('en-US')} spins`);
    expect(rtp).to.be.closeTo(spec.declaredRtp, tolerance);
  });
});
