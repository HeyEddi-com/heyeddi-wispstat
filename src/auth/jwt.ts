/** Minimal RS256 JWT check against a JWKS URL. Used for Firebase and Cloudflare Access. */

interface Jwk extends JsonWebKey {
  kid?: string;
}

function b64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(part: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as T;
  } catch {
    return null;
  }
}

export async function verifyRs256Jwt(
  token: string,
  jwksUrl: string,
  expect: { iss?: string; aud?: string }
): Promise<{ sub: string; email?: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = decodeJson<{ alg?: string; kid?: string }>(parts[0]!);
  const payload = decodeJson<{ sub?: string; email?: string; iss?: string; aud?: string | string[]; exp?: number }>(parts[1]!);
  if (!header || header.alg !== 'RS256' || !header.kid || !payload?.sub) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  if (expect.iss && payload.iss !== expect.iss) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (expect.aud && !aud.includes(expect.aud)) return null;

  const jwks = await fetch(jwksUrl).then((response) => response.json() as Promise<{ keys?: Jwk[] }>).catch(() => null);
  const jwk = jwks?.keys?.find((key) => key.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]!), data);
  if (!ok) return null;
  return { sub: payload.sub, email: payload.email };
}
