import { describe, expect, it } from 'vitest';
import trackerSource from '../tracker/ws.ts?raw';

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('tracker privacy', () => {
  it('does not touch storage, screen, or fingerprinting APIs', () => {
    const code = stripComments(trackerSource);
    const banned = [
      'cookie',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'screen.',
      'getTimezoneOffset',
      'canvas',
      'navigator.languages',
    ];
    for (const token of banned) {
      expect(code.includes(token), token).toBe(false);
    }
  });
});
