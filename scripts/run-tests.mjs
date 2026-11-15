// Starts the game server, waits until it responds, runs Cypress, then stops the server.
// Usage: node scripts/run-tests.mjs [run|open] [extra cypress args...]
import { spawn } from 'node:child_process';

const URL = 'http://localhost:3000';
const [mode = 'run', ...cypressArgs] = process.argv.slice(2);

async function isServerUp() {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
}

// If the game is already running (e.g. via start-game.bat), reuse it instead of starting a second copy.
const alreadyRunning = await isServerUp();
if (alreadyRunning) console.log(`Game is already running at ${URL}, using it for the tests.`);
const server = alreadyRunning
  ? null
  : spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { stdio: 'inherit' });

async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isServerUp()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not start at ${URL} within ${timeoutMs / 1000}s`);
}

let exitCode = 1;
try {
  await waitForServer();
  exitCode = await new Promise((resolve) => {
    const cypress = spawn('npx', ['cypress', mode, ...cypressArgs], { stdio: 'inherit', shell: true });
    cypress.on('exit', (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error.message);
} finally {
  server?.kill();
}
process.exit(exitCode);
