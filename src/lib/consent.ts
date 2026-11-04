/**
 * v1.4 consented visitor id hashing.
 */

export async function hashCid(pepper: string, sid: number, cid: string): Promise<Uint8Array> {
  const material = new TextEncoder().encode(`${pepper}|${sid}|${cid}`);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return new Uint8Array(digest);
}

export function isValidCid(cid: unknown): cid is string {
  return typeof cid === 'string' && /^[0-9a-f]{32}$/i.test(cid);
}
