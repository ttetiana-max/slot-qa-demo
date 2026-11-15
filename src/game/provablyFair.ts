// Provably fair outcome generation.
//
// 1. Before playing, the server picks a secret serverSeed and shows the player only sha256(serverSeed).
// 2. Each spin result = HMAC-SHA256(key = serverSeed, message = `${clientSeed}:${nonce}`).
// 3. When the seed is rotated, the server reveals serverSeed. The player can check that
//    sha256(serverSeed) matches the hash they saw earlier, and re-compute every result.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { REEL, REEL_COUNT, TOTAL_WEIGHT, SymbolId } from './config';

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export const generateServerSeed = (): string => randomBytes(32).toString('hex');

/** Maps a position in [0, TOTAL_WEIGHT) to a symbol on the weighted reel. */
export function symbolAt(position: number): SymbolId {
  let acc = 0;
  for (const symbol of REEL) {
    acc += symbol.weight;
    if (position < acc) return symbol.id;
  }
  throw new Error(`Reel position out of range: ${position}`);
}

/** Deterministic spin outcome. Each reel uses 4 bytes of the HMAC as an unsigned 32-bit number. */
export function outcomeFromSeeds(serverSeed: string, clientSeed: string, nonce: number): SymbolId[] {
  const hash = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest();
  const symbols: SymbolId[] = [];
  for (let reel = 0; reel < REEL_COUNT; reel++) {
    const n = hash.readUInt32BE(reel * 4);
    symbols.push(symbolAt(Math.floor((n / 2 ** 32) * TOTAL_WEIGHT)));
  }
  return symbols;
}
