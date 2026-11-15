// Small helpers around the game API so the specs read like test scenarios.

export interface SessionView {
  sessionId: string;
  balance: number;
  serverSeedHash: string;
  nonce: number;
}

export interface SpinResult {
  roundId: string;
  symbols: string[];
  bet: number;
  multiplier: number;
  win: number;
  balance: number;
  nonce: number;
  clientSeed: string;
  serverSeedHash: string;
}

export interface RotateSeedResult extends SessionView {
  revealedServerSeed: string;
  previousServerSeedHash: string;
}

export const createSession = (initialBalance?: number) =>
  cy
    .request<SessionView>('POST', '/api/sessions', initialBalance === undefined ? {} : { initialBalance })
    .its('body');

export const getSession = (sessionId: string) => cy.request<SessionView>(`/api/sessions/${sessionId}`).its('body');

/** Does NOT fail on 4xx, so negative tests can assert on the status code themselves. */
export const spin = (sessionId: string, bet: unknown, clientSeed: unknown = 'qa-client-seed') =>
  cy.request<SpinResult & { error?: string }>({
    method: 'POST',
    url: `/api/sessions/${sessionId}/spin`,
    body: { bet, clientSeed },
    failOnStatusCode: false,
  });

export interface Transaction {
  roundId: string;
  sessionId: string;
  nonce: number;
  clientSeed: string;
  serverSeedHash: string;
  symbols: string[];
  bet: number;
  multiplier: number;
  win: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

export const getTransactions = (sessionId: string) =>
  cy
    .request<{ transactions: Transaction[] }>(`/api/sessions/${sessionId}/transactions`)
    .then((response) => response.body.transactions);

export const rotateSeed = (sessionId: string) =>
  cy.request<RotateSeedResult>('POST', `/api/sessions/${sessionId}/rotate-seed`).its('body');
