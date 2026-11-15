# Slot QA Demo: Cypress + TypeScript

A small 3-reel slot game and a full automated test suite for it: wallet and REST API, game math
(paytable and RTP), provably fair outcomes, transaction history and the canvas-based UI.

**Stack:** TypeScript, Cypress, Node.js, REST/JSON API, HTML5 Canvas, GitHub Actions.

## What's inside

```
src/game/config.ts         math model: reel weights, paytable, declared RTP, bet limits
src/game/provablyFair.ts   outcome generation: HMAC-SHA256(serverSeed, clientSeed:nonce)
src/game/slot.ts           payout calculation, theoretical RTP, million-spin simulation
src/server.ts              REST API (sessions, spins, transaction history, seed rotation) + web page
public/                    web client, reels drawn on <canvas>

cypress/fixtures/game-spec.json      spec from the "math team", the reference for the tests
cypress/support/gameSpec.ts          independent calculation of expected payouts and RTP from the spec
cypress/support/fairnessVerifier.ts  independent provably fair verifier (Web Crypto in the browser)
cypress/e2e/api/wallet.cy.ts         balance, bets, boundary values, API errors
cypress/e2e/api/transactions.cy.ts   transaction history: one record per spin, round IDs, balance chain
cypress/e2e/math/paytable.cy.ts      paytable, all 125 combinations, model RTP
cypress/e2e/math/rtp.cy.ts           statistics: 1,000,000 spins, RTP and symbol frequencies
cypress/e2e/math/spin-series.cy.ts   1,000 real spins through the API: exact money checks and RTP
cypress/e2e/fairness/provably-fair.cy.ts   provably fair: hash commitment, recomputing results
cypress/e2e/fairness/client-seed.cy.ts     client seed: sent value, validation, effect on results
cypress/e2e/ui/game.cy.ts            UI: spin, balance, errors, stubbed big win, double-click protection
.github/workflows/e2e.yml            runs the whole suite on every push and pull request
```

## How to run

Requires [Node.js](https://nodejs.org) 20 or later.

```bash
npm install
npm test               # starts the game server, runs all tests headless, stops the server
npm run test:open      # opens the Cypress app to watch the tests click through the game
npm start              # just the game, at http://localhost:3000
```

Quicker run with a smaller RTP simulation: `npm test -- --env RTP_SPINS=200000`.

On Windows you can also double-click `start-game.bat` (the game) or `run-tests.bat` (the Cypress app).

## Key testing decisions

**1. Independent oracle.** Tests never take expected values from the game's code. They calculate them
from the spec in `game-spec.json`. If a developer changes the paytable without the math team's
approval, a test fails.

**2. RTP is checked statistically, with a calculated tolerance.** A random game never hits 95.875%
exactly. The tolerance comes from the game's variance: `4 × sqrt(variance / spins)`, about ±2.5% for a
million spins. The simulation seed is logged, so a failing run can be reproduced.

**3. Simulation does not replace exact math.** Changing the SEVEN payout from 400 to 500 moves the RTP
from 95.875% to 97.125%. Three paytable tests catch it immediately, but the million-spin simulation does
not: 1.25% is inside its ±2.5% tolerance. The simulation validates the random number generator; payout
accuracy is validated by exact calculation of the model.

**4. Every check has one unambiguous outcome.** The API spin series does not assert "RTP between 95% and
97%": with a standard deviation of about 6.2 bets per spin, the RTP after 100 spins can honestly be
anywhere from about 0% to 220%, and a ±1% range needs about 6 million spins. Instead, money is checked
exactly (each win against the paytable, the balance after every spin, start − bets + wins), and the RTP
uses a tolerance calculated for the number of spins played.

**5. Provably fair is verified the way a player would verify it.** Before playing, the server shows only
the hash of its seed. After rotation the seed is revealed, and the test checks that `sha256(seed)`
matches the promised hash and recomputes every result with its own independent code.

**6. Client seed.** Changing the client seed must NOT change the server seed hash: that hash is the
server's commitment and changes only on rotation. What changes is the result. The tests check the value
actually sent, validation (empty, 64 vs 65 characters) and that every spin recomputes with its own client
seed. Verified: if the server ignores the client seed, 3 tests fail.

**7. Data, not just the screen.** After every spin there must be exactly one transaction record (round ID,
bet, win, symbols, balance before and after). Records form an unbroken balance chain, round IDs are
unique, and rejected bets write nothing. In a real project these would be SQL checks against the
transactions table.

**8. Canvas.** Cypress cannot see what is drawn on a canvas, so the game exposes its state on
`window.__gameState` (a test hook) and the tests read it. This is the usual approach for PixiJS/Phaser
games.

**9. Money and boundaries.** Bet boundaries (0, min, max, max + 1, decimals, strings) are rejected without
changing the balance. The Spin button is disabled while a request is in flight, so a double click cannot
place two bets.

**10. Rare events are stubbed.** A 400x win happens once in 8,000 spins, so `cy.intercept` replaces the
server response to test how the UI shows it.

## Possible next steps

- Concurrent requests on one session (race conditions in balance updates, duplicate nonces).
- API load tests with k6 or Artillery.
- Visual screenshot comparison for the canvas.
- Moving the transaction history to a real database (PostgreSQL) and checking it with SQL.
