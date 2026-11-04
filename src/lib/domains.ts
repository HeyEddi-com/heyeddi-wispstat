/**
 * Single measurement-root domain: host itself + any subdomain under it.
 */

const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+|localhost$/i;

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/** Parse operator input into one stored domain root, or null if invalid. */
export function parseDomainInput(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value || /[\s,]/.test(value)) return null;

  try {
    if (value.includes('://')) {
      value = new URL(value).hostname;
    } else if (value.includes('/')) {
      value = value.split('/')[0] || '';
    }
  } catch {
    return null;
  }

  value = normalizeHost(value).replace(/^www\./, '');
  if (!value || value.length > 253) return null;
  if (!HOSTNAME.test(value)) return null;
  return value;
}

/** True when host is the domain or a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function hostMatchesAnyDomain(host: string, domains: string[]): boolean {
  return domains.some((domain) => hostMatchesDomain(host, domain));
}

/** Accept API body: single `domain` string or legacy `domains[]` (first valid wins, max one stored). */
export function resolveSiteDomain(body: { domain?: unknown; domains?: unknown }): string | null {
  if (typeof body.domain === 'string') {
    return parseDomainInput(body.domain);
  }
  if (Array.isArray(body.domains) && body.domains.length > 0) {
    if (body.domains.length > 1) return null;
    const first = body.domains[0];
    if (typeof first !== 'string') return null;
    return parseDomainInput(first);
  }
  return null;
}
