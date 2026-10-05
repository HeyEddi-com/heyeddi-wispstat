/**
 * Unit tests for utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  generateSiteId,
  isValidSiteId,
  generateToken,
  normalizePath,
  normalizeUtm,
  normalizeEventName,
  normalizeLanguage,
  normalizeValue,
} from '../src/lib/utils';

describe('Site ID', () => {
  it('generates valid site IDs', () => {
    const id = generateSiteId();
    expect(id).toMatch(/^s_[0-9a-hjkmnp-z]{16}$/);
  });
  
  it('validates site ID format', () => {
    expect(isValidSiteId('s_k7q2m9x4t8p3w6ab')).toBe(true);
    expect(isValidSiteId('s_0123456789abcdef')).toBe(true);
    expect(isValidSiteId('s_invalid')).toBe(false);
    expect(isValidSiteId('invalid')).toBe(false);
    expect(isValidSiteId('s_')).toBe(false);
  });
});

describe('Path normalization', () => {
  it('ensures leading slash', () => {
    expect(normalizePath('about', 256)).toBe('/about');
    expect(normalizePath('/about', 256)).toBe('/about');
  });
  
  it('strips query and hash', () => {
    expect(normalizePath('/page?foo=bar', 256)).toBe('/page');
    expect(normalizePath('/page#section', 256)).toBe('/page');
  });
  
  it('truncates long paths', () => {
    const long = '/' + 'a'.repeat(300);
    expect(normalizePath(long, 256)).toHaveLength(256);
  });
});

describe('UTM normalization', () => {
  it('lowercases and trims', () => {
    expect(normalizeUtm('  GitHub  ', 100)).toBe('github');
    expect(normalizeUtm('Google Ads', 100)).toBe('google ads');
  });
  
  it('rejects email-like values', () => {
    expect(normalizeUtm('user@example.com', 100)).toBeNull();
    expect(normalizeUtm('test@test', 100)).toBeNull();
  });
  
  it('rejects too-long values', () => {
    expect(normalizeUtm('a'.repeat(101), 100)).toBeNull();
  });
  
  it('rejects invalid characters', () => {
    expect(normalizeUtm('test<script>', 100)).toBeNull();
  });
  
  it('returns null for empty', () => {
    expect(normalizeUtm('', 100)).toBeNull();
    expect(normalizeUtm(undefined, 100)).toBeNull();
  });
});

describe('Event name normalization', () => {
  it('lowercases and trims', () => {
    expect(normalizeEventName('Signup', 64)).toBe('signup');
    expect(normalizeEventName('  checkout_started  ', 64)).toBe('checkout_started');
  });
  
  it('allows valid charset', () => {
    expect(normalizeEventName('event:test-1.0', 64)).toBe('event:test-1.0');
  });
  
  it('rejects invalid charset', () => {
    expect(normalizeEventName('event name', 64)).toBeNull();
    expect(normalizeEventName('event@test', 64)).toBeNull();
  });
  
  it('rejects too long', () => {
    expect(normalizeEventName('a'.repeat(65), 64)).toBeNull();
  });
});

describe('Language normalization', () => {
  it('extracts base language', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('es-MX')).toBe('es');
    expect(normalizeLanguage('pt-BR')).toBe('pt');
  });
  
  it('validates format', () => {
    expect(normalizeLanguage('invalid')).toBe('');
    expect(normalizeLanguage('e')).toBe('');
    expect(normalizeLanguage('en-')).toBe('en');
  });
  
  it('handles empty', () => {
    expect(normalizeLanguage('')).toBe('');
    expect(normalizeLanguage(undefined)).toBe('');
  });
});

describe('Value normalization', () => {
  it('converts to hundredths', () => {
    expect(normalizeValue(49.9)).toBe(4990);
    expect(normalizeValue(100.00)).toBe(10000);
    expect(normalizeValue(0.99)).toBe(99);
  });
  
  it('rounds to 2 decimals', () => {
    expect(normalizeValue(49.999)).toBe(5000);
    expect(normalizeValue(49.994)).toBe(4999);
  });
  
  it('rejects invalid values', () => {
    expect(normalizeValue(-1)).toBeNull();
    expect(normalizeValue(1e10)).toBeNull();
    expect(normalizeValue(Infinity)).toBeNull();
    expect(normalizeValue(NaN)).toBeNull();
    expect(normalizeValue(undefined)).toBeNull();
  });
  
  it('handles zero', () => {
    expect(normalizeValue(0)).toBe(0);
  });
});

describe('Token generation', () => {
  it('generates tokens of correct length', () => {
    const token = generateToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    
    const decoded = Buffer.from(
      token.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );
    expect(decoded.length).toBe(32);
  });
});
