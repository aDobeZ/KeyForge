import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SYMBOLS,
  generatePassword,
  getMasterPasswordFingerprint,
  normalizeSymbols,
} from '../src/core/lesspass';

describe('LessPass v2 compatibility & custom symbols', () => {
  it('matches official LessPass v2 test vector with default symbols', async () => {
    const pwd = await generatePassword('password', {
      site: 'example.org',
      login: 'contact@example.org',
      counter: 1,
      length: 16,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
      customSymbols: DEFAULT_SYMBOLS,
    });
    expect(pwd).toBe('WHLpUL)e00[iHR+w');
  });

  it('produces deterministic different passwords when counter increments', async () => {
    const pwd1 = await generatePassword('my-secret-master', {
      site: 'github.com',
      login: 'user@example.com',
      counter: 1,
      length: 16,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    });
    const pwd2 = await generatePassword('my-secret-master', {
      site: 'github.com',
      login: 'user@example.com',
      counter: 2,
      length: 16,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
    });

    expect(pwd1).not.toBe(pwd2);
    expect(pwd1.length).toBe(16);
    expect(pwd2.length).toBe(16);
  });

  it('restricts symbols strictly to customSymbols when specified', async () => {
    const allowed = '@#$';
    const pwd = await generatePassword('master123', {
      site: 'bank.example.com',
      login: 'alice',
      counter: 1,
      length: 20,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
      customSymbols: allowed,
    });

    expect(pwd.length).toBe(20);
    // Ensure every non-alphanumeric char in pwd is in allowed
    const nonAlnum = pwd.replace(/[a-zA-Z0-9]/g, '');
    expect(nonAlnum.length).toBeGreaterThanOrEqual(1);
    for (const ch of nonAlnum) {
      expect(allowed).toContain(ch);
    }
  });

  it('normalizes symbols deterministically regardless of input order', () => {
    expect(normalizeSymbols('$!@#')).toBe('!#$@');
    expect(normalizeSymbols('!!@@##')).toBe('!#@');
    expect(normalizeSymbols(DEFAULT_SYMBOLS)).toBe(DEFAULT_SYMBOLS);
  });

  it('computes deterministic master password fingerprint', async () => {
    const fp1 = await getMasterPasswordFingerprint('correct-horse-battery');
    const fp2 = await getMasterPasswordFingerprint('correct-horse-battery');
    const fp3 = await getMasterPasswordFingerprint('correct-horse-batterz');

    expect(fp1).toHaveLength(3);
    expect(fp1).toEqual(fp2);
    expect(fp1).not.toEqual(fp3);
  });
});
