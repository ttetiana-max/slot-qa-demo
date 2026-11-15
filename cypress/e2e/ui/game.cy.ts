// End-to-end UI tests. The reels are drawn on a canvas, so we read the game state from the
// window.__gameState test hook and check the regular DOM elements around the canvas.
import { spec } from '../../support/gameSpec';

const gameState = () => cy.window().its('__gameState');

describe('Slot game UI', () => {
  beforeEach(() => {
    cy.visit('/');
    gameState().its('ready').should('eq', true);
  });

  it('shows the starting balance and the reels', () => {
    cy.get('[data-cy=balance]').should('have.text', String(spec.startingBalance));
    cy.get('[data-cy=reels]').should('be.visible');
    cy.get('[data-cy=server-seed-hash]').invoke('text').should('match', /^[0-9a-f]{64}$/);
  });

  it('a spin updates the balance shown to the player', () => {
    cy.get('[data-cy=bet-input]').clear().type('10');
    cy.get('[data-cy=spin-button]').click();

    gameState()
      .its('lastResult')
      .should('not.be.null')
      .then((result) => {
        expect(result!.balance).to.eq(spec.startingBalance - 10 + result!.win);
        cy.get('[data-cy=balance]').should('have.text', String(result!.balance));
        cy.get('[data-cy=result]').should('have.text', result!.win > 0 ? `WIN ${result!.win}` : 'No win');
        cy.get('[data-cy=nonce]').should('have.text', '1');
      });
  });

  it('shows a clear error for an invalid bet and keeps the balance', () => {
    cy.get('[data-cy=bet-input]').clear().type(String(spec.maxBet + 1));
    cy.get('[data-cy=spin-button]').click();
    cy.get('[data-cy=error]').should('contain.text', `between ${spec.minBet} and ${spec.maxBet}`);
    cy.get('[data-cy=balance]').should('have.text', String(spec.startingBalance));
  });

  it('shows a big win correctly (server response stubbed)', () => {
    // Real wins of 400x are rare, so we stub the API response to test how the UI handles one.
    cy.intercept('POST', '/api/sessions/*/spin', {
      statusCode: 200,
      body: {
        symbols: ['SEVEN', 'SEVEN', 'SEVEN'],
        bet: 10,
        multiplier: 400,
        win: 4000,
        balance: 4990,
        nonce: 0,
        clientSeed: 'stub',
        serverSeedHash: 'stub',
      },
    }).as('spin');

    cy.get('[data-cy=spin-button]').click();
    cy.wait('@spin');
    cy.get('[data-cy=result]').should('have.text', 'WIN 4000');
    cy.get('[data-cy=balance]').should('have.text', '4990');
  });

  it('blocks a second spin while the first one is still in progress', () => {
    // Double clicks must not place two bets.
    cy.intercept('POST', '/api/sessions/*/spin', (req) => {
      req.on('response', (res) => {
        res.setDelay(1000);
      });
    }).as('slowSpin');

    cy.get('[data-cy=spin-button]').click();
    cy.get('[data-cy=spin-button]').should('be.disabled');
    cy.wait('@slowSpin');
    cy.get('[data-cy=spin-button]').should('be.enabled');
    cy.get('@slowSpin.all').should('have.length', 1);
  });
});
