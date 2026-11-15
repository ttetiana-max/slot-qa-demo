// Web client. The reels are drawn on a <canvas>, like real HTML5 games (PixiJS/Phaser also render to canvas).
// Cypress cannot "see" what is drawn on a canvas, so the game exposes its state on window.__gameState
// as a test hook. This is the standard way to make canvas games testable.
const state = {
  ready: false,
  sessionId: null,
  balance: 0,
  serverSeedHash: null,
  nonce: 0,
  lastResult: null,
};
window.__gameState = state;

const $ = (name) => document.querySelector(`[data-cy="${name}"]`);
const canvas = $('reels');
const COLORS = { CHERRY: '#e63946', LEMON: '#f4d35e', BELL: '#f4a261', STAR: '#4cc9f0', SEVEN: '#9b5de5' };
const LABELS = { CHERRY: '🍒', LEMON: '🍋', BELL: '🔔', STAR: '⭐', SEVEN: '7' };
const ERROR_MESSAGES = {
  INVALID_BET: 'Bet must be a whole number between 1 and 100',
  INSUFFICIENT_FUNDS: 'Not enough balance for this bet',
  INVALID_CLIENT_SEED: 'Client seed must be 1-64 characters',
};

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function drawReels(symbols) {
  const ctx = canvas.getContext('2d');
  const reelWidth = canvas.width / symbols.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  symbols.forEach((symbol, i) => {
    ctx.fillStyle = '#1d1b2f';
    ctx.fillRect(i * reelWidth + 6, 6, reelWidth - 12, canvas.height - 12);
    ctx.fillStyle = COLORS[symbol] || '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[symbol] || '?', i * reelWidth + reelWidth / 2, canvas.height / 2);
  });
}

function render() {
  $('balance').textContent = String(state.balance);
  $('server-seed-hash').textContent = state.serverSeedHash;
  $('nonce').textContent = String(state.nonce);
}

async function onSpin() {
  const button = $('spin-button');
  button.disabled = true; // no double spins while a request is in flight
  $('error').textContent = '';
  try {
    const result = await api(`/api/sessions/${state.sessionId}/spin`, {
      bet: Number($('bet-input').value),
      clientSeed: $('client-seed-input').value,
    });
    state.lastResult = result;
    state.balance = result.balance;
    state.nonce = result.nonce + 1;
    drawReels(result.symbols);
    $('result').textContent = result.win > 0 ? `WIN ${result.win}` : 'No win';
    render();
  } catch (error) {
    $('error').textContent = ERROR_MESSAGES[error.message] || `Something went wrong: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function init() {
  const session = await api('/api/sessions', {});
  Object.assign(state, {
    sessionId: session.sessionId,
    balance: session.balance,
    serverSeedHash: session.serverSeedHash,
    nonce: session.nonce,
  });
  $('client-seed-input').value = Math.random().toString(36).slice(2, 12);
  drawReels(['SEVEN', 'SEVEN', 'SEVEN']);
  render();
  $('spin-button').addEventListener('click', onSpin);
  $('spin-button').disabled = false;
  state.ready = true;
}

init();
