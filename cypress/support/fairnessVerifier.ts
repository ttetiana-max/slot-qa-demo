// A player-side verifier written independently from the server code.
// It runs in the browser using the Web Crypto API, exactly like a "verify this bet" page would.
import { spec, totalWeight } from './gameSpec';

const encoder = new TextEncoder();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Re-computes the symbols of a spin from the revealed server seed, client seed and nonce. */
export async function recomputeOutcome(serverSeed: string, clientSeed: string, nonce: number): Promise<string[]> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new DataView(await crypto.subtle.sign('HMAC', key, encoder.encode(`${clientSeed}:${nonce}`)));

  return Array.from({ length: spec.reelCount }, (_, reel) => {
    const n = signature.getUint32(reel * 4); // big-endian, same as the server
    let position = Math.floor((n / 2 ** 32) * totalWeight);
    for (const symbol of spec.reel) {
      if (position < symbol.weight) return symbol.id;
      position -= symbol.weight;
    }
    throw new Error(`Position out of range on reel ${reel}`);
  });
}
