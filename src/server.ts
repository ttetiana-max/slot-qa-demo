// Minimal game server: REST API for sessions/spins + static files for the web client.
// No framework on purpose, so the whole flow is easy to read.
import http, { IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_BET, MIN_BET, STARTING_BALANCE } from './game/config';
import { generateServerSeed, outcomeFromSeeds, sha256 } from './game/provablyFair';
import { payoutMultiplier } from './game/slot';

/** One record per accepted spin. In a real game this row lives in a database table. */
interface Transaction {
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

interface Session {
  id: string;
  balance: number;
  serverSeed: string;
  nonce: number;
  transactions: Transaction[];
}

const sessions = new Map<string, Session>();

class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATIC_FILES: Record<string, [file: string, contentType: string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new ApiError(400, 'INVALID_JSON');
  }
}

function getSession(id: string): Session {
  const session = sessions.get(id);
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND');
  return session;
}

/** What the player may see. The server seed itself is never exposed before rotation. */
const publicView = (s: Session) => ({
  sessionId: s.id,
  balance: s.balance,
  serverSeedHash: sha256(s.serverSeed),
  nonce: s.nonce,
});

async function handleApi(method: string, url: string, req: IncomingMessage): Promise<[number, unknown]> {
  // POST /api/sessions  { initialBalance? }  -> new player session
  if (method === 'POST' && url === '/api/sessions') {
    const body = await readJson(req);
    // initialBalance is a test hook (like a test-only admin API) so tests can set up edge cases quickly.
    const initialBalance = body.initialBalance ?? STARTING_BALANCE;
    if (typeof initialBalance !== 'number' || !Number.isInteger(initialBalance) || initialBalance < 0) {
      throw new ApiError(400, 'INVALID_BALANCE');
    }
    const session: Session = {
      id: randomUUID(),
      balance: initialBalance,
      serverSeed: generateServerSeed(),
      nonce: 0,
      transactions: [],
    };
    sessions.set(session.id, session);
    return [201, publicView(session)];
  }

  const match = url.match(/^\/api\/sessions\/([^/]+)(\/spin|\/rotate-seed|\/transactions)?$/);
  if (!match) throw new ApiError(404, 'NOT_FOUND');
  const session = getSession(match[1]);
  const action = match[2];

  // GET /api/sessions/:id
  if (method === 'GET' && !action) return [200, publicView(session)];

  // GET /api/sessions/:id/transactions  -> transaction history, oldest first
  if (method === 'GET' && action === '/transactions') return [200, { transactions: session.transactions }];

  // POST /api/sessions/:id/spin  { bet, clientSeed }
  if (method === 'POST' && action === '/spin') {
    const { bet, clientSeed } = await readJson(req);
    if (typeof bet !== 'number' || !Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
      throw new ApiError(400, 'INVALID_BET');
    }
    if (typeof clientSeed !== 'string' || clientSeed.length < 1 || clientSeed.length > 64) {
      throw new ApiError(400, 'INVALID_CLIENT_SEED');
    }
    if (bet > session.balance) throw new ApiError(400, 'INSUFFICIENT_FUNDS');

    const nonce = session.nonce;
    const symbols = outcomeFromSeeds(session.serverSeed, clientSeed, nonce);
    const multiplier = payoutMultiplier(symbols);
    const win = bet * multiplier;
    const balanceBefore = session.balance;
    const serverSeedHash = sha256(session.serverSeed);
    const roundId = randomUUID();
    session.balance = balanceBefore - bet + win;
    session.nonce += 1;
    session.transactions.push({
      roundId,
      sessionId: session.id,
      nonce,
      clientSeed,
      serverSeedHash,
      symbols,
      bet,
      multiplier,
      win,
      balanceBefore,
      balanceAfter: session.balance,
      createdAt: new Date().toISOString(),
    });
    return [200, { roundId, symbols, bet, multiplier, win, balance: session.balance, nonce, clientSeed, serverSeedHash }];
  }

  // POST /api/sessions/:id/rotate-seed  -> reveal the old seed, start a new one
  if (method === 'POST' && action === '/rotate-seed') {
    const revealedServerSeed = session.serverSeed;
    session.serverSeed = generateServerSeed();
    session.nonce = 0;
    return [200, { revealedServerSeed, previousServerSeedHash: sha256(revealedServerSeed), ...publicView(session) }];
  }

  throw new ApiError(405, 'METHOD_NOT_ALLOWED');
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const url = (req.url ?? '/').split('?')[0];
  const sendJson = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    if (url.startsWith('/api/')) {
      const [status, data] = await handleApi(method, url, req);
      return sendJson(status, data);
    }
    const file = STATIC_FILES[url];
    if (!file || method !== 'GET') return sendJson(404, { error: 'NOT_FOUND' });
    const content = await readFile(path.join(PUBLIC_DIR, file[0]));
    res.writeHead(200, { 'Content-Type': file[1] });
    res.end(content);
  } catch (error) {
    if (error instanceof ApiError) return sendJson(error.status, { error: error.code });
    console.error(error);
    sendJson(500, { error: 'INTERNAL_ERROR' });
  }
});

const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, () => console.log(`Slot demo running at http://localhost:${PORT}`));
