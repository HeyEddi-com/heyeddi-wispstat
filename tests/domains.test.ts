import { describe, expect, it } from 'vitest';
import {
  hostMatchesDomain,
  parseDomainInput,
  resolveSiteDomain,
} from '../src/lib/domains';

describe('parseDomainInput', () => {
  it('accepts apex and strips www / scheme', () => {
    expect(parseDomainInput('example.com')).toBe('example.com');
    expect(parseDomainInput('www.example.com')).toBe('example.com');
    expect(parseDomainInput('https://Example.com/path')).toBe('example.com');
  });

  it('accepts a subdomain root', () => {
    expect(parseDomainInput('b.lol.com')).toBe('b.lol.com');
  });

  it('rejects lists and junk', () => {
    expect(parseDomainInput('a.com,b.com')).toBeNull();
    expect(parseDomainInput('not a host')).toBeNull();
    expect(parseDomainInput('')).toBeNull();
  });
});

describe('hostMatchesDomain', () => {
  it('matches host and children for an apex root', () => {
    expect(hostMatchesDomain('lol.com', 'lol.com')).toBe(true);
    expect(hostMatchesDomain('www.lol.com', 'lol.com')).toBe(true);
    expect(hostMatchesDomain('b.lol.com', 'lol.com')).toBe(true);
    expect(hostMatchesDomain('x.b.lol.com', 'lol.com')).toBe(true);
    expect(hostMatchesDomain('evil.com', 'lol.com')).toBe(false);
    expect(hostMatchesDomain('lol.com.evil.com', 'lol.com')).toBe(false);
  });

  it('does not let a subdomain root measure the parent or siblings', () => {
    expect(hostMatchesDomain('b.lol.com', 'b.lol.com')).toBe(true);
    expect(hostMatchesDomain('a.b.lol.com', 'b.lol.com')).toBe(true);
    expect(hostMatchesDomain('lol.com', 'b.lol.com')).toBe(false);
    expect(hostMatchesDomain('www.lol.com', 'b.lol.com')).toBe(false);
    expect(hostMatchesDomain('a.lol.com', 'b.lol.com')).toBe(false);
  });
});

describe('resolveSiteDomain', () => {
  it('takes domain or a single-item domains array', () => {
    expect(resolveSiteDomain({ domain: 'heyeddi.com' })).toBe('heyeddi.com');
    expect(resolveSiteDomain({ domains: ['heyeddi.com'] })).toBe('heyeddi.com');
    expect(resolveSiteDomain({ domains: ['a.com', 'b.com'] })).toBeNull();
  });
});
