import { describe, expect, it } from 'vitest';
import {
  decryptBase64WithPreview,
  decryptBytesWithPreview,
  encryptProfilesToBase64,
  encryptProfilesToBytes,
} from '../src/core/crypto-sync';
import { SiteProfile } from '../src/core/storage';

const sampleProfiles: SiteProfile[] = [
  {
    id: '1',
    site: 'github.com',
    login: 'johnny@example.com',
    counter: 3,
    length: 16,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
    customSymbols: '!@#$%',
    updatedAt: 1700000000000,
  },
];

describe('AES-256-CTR encrypted sync with garbled preview', () => {
  it('decrypts back to exact profiles when master password matches', async () => {
    const encryptedBytes = await encryptProfilesToBytes(sampleProfiles, 'super-secret-master');
    const result = await decryptBytesWithPreview(encryptedBytes, 'super-secret-master');

    expect(result.ok).toBe(true);
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles?.[0].site).toBe('github.com');
    expect(result.profiles?.[0].counter).toBe(3);
    expect(result.profiles?.[0].customSymbols).toBe('!#$%@');
    expect(result.previewText).toContain('"github.com"');
  });

  it('outputs garbled preview text without throwing when master password is wrong', async () => {
    const base64 = await encryptProfilesToBase64(sampleProfiles, 'right-password');
    const result = await decryptBase64WithPreview(base64, 'wrong-password');

    expect(result.ok).toBe(false);
    expect(result.profiles).toBeNull();
    expect(result.previewText.length).toBeGreaterThan(20);
    expect(result.previewText).not.toContain('github.com');
    expect(result.errorReason).toBeTruthy();
  });
});
