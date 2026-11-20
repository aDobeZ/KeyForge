import { SiteProfile, sanitizeProfile } from './storage';

const MAGIC_HEADER = new Uint8Array([0x4d, 0x4c, 0x50, 0x31]); // "MLP1"
const SALT_LENGTH = 16;
const COUNTER_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

export interface ExportPayload {
  app: 'MyLessPass';
  version: 1;
  exportedAt: string;
  profiles: SiteProfile[];
}

export interface DecryptPreviewResult {
  ok: boolean;
  previewText: string;
  profiles: SiteProfile[] | null;
  errorReason?: string;
}

async function deriveAesCtrKey(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-CTR', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt profiles into binary format: [MAGIC(4) | SALT(16) | COUNTER(16) | CIPHERTEXT]
 */
export async function encryptProfilesToBytes(
  profiles: SiteProfile[],
  masterPassword: string
): Promise<Uint8Array> {
  if (!masterPassword) {
    throw new Error('请输入主密码用于加密导出文件');
  }

  const payload: ExportPayload = {
    app: 'MyLessPass',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles,
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const counter = crypto.getRandomValues(new Uint8Array(COUNTER_LENGTH));
  const key = await deriveAesCtrKey(masterPassword, salt);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-CTR',
      counter: counter as BufferSource,
      length: 64,
    },
    key,
    plaintext
  );

  const cipherBytes = new Uint8Array(encryptedBuffer);
  const result = new Uint8Array(
    MAGIC_HEADER.length + SALT_LENGTH + COUNTER_LENGTH + cipherBytes.length
  );

  let offset = 0;
  result.set(MAGIC_HEADER, offset);
  offset += MAGIC_HEADER.length;
  result.set(salt, offset);
  offset += SALT_LENGTH;
  result.set(counter, offset);
  offset += COUNTER_LENGTH;
  result.set(cipherBytes, offset);

  return result;
}

export async function encryptProfilesToBase64(
  profiles: SiteProfile[],
  masterPassword: string
): Promise<string> {
  const bytes = await encryptProfilesToBytes(profiles, masterPassword);
  return bytesToBase64(bytes);
}

/**
 * Decrypt binary data using AES-256-CTR without authentication tag.
 * If the master password is wrong, AES-CTR still outputs raw decrypted bytes,
 * resulting in visible garbled text in `previewText` so the user knows the password does not match.
 */
export async function decryptBytesWithPreview(
  rawBytes: Uint8Array,
  masterPassword: string
): Promise<DecryptPreviewResult> {
  const headerSize = MAGIC_HEADER.length + SALT_LENGTH + COUNTER_LENGTH;
  if (rawBytes.length <= headerSize) {
    return {
      ok: false,
      previewText: '',
      profiles: null,
      errorReason: '文件长度过短，不是有效的 MyLessPass 备份文件',
    };
  }

  for (let i = 0; i < MAGIC_HEADER.length; i++) {
    if (rawBytes[i] !== MAGIC_HEADER[i]) {
      return {
        ok: false,
        previewText: '',
        profiles: null,
        errorReason: '文件头不匹配，请确认选择了正确的 .mlp 备份文件或加密文本',
      };
    }
  }

  const saltStart = MAGIC_HEADER.length;
  const counterStart = saltStart + SALT_LENGTH;
  const cipherStart = counterStart + COUNTER_LENGTH;

  const salt = rawBytes.slice(saltStart, counterStart);
  const counter = rawBytes.slice(counterStart, cipherStart);
  const cipherBytes = rawBytes.slice(cipherStart);

  const key = await deriveAesCtrKey(masterPassword, salt);
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-CTR',
      counter: counter as BufferSource,
      length: 64,
    },
    key,
    cipherBytes
  );

  const decryptedBytes = new Uint8Array(decryptedBuffer);
  const previewText = new TextDecoder('utf-8', { fatal: false }).decode(decryptedBytes);

  try {
    const parsed = JSON.parse(previewText) as Partial<ExportPayload>;
    if (
      parsed &&
      parsed.app === 'MyLessPass' &&
      Array.isArray(parsed.profiles)
    ) {
      return {
        ok: true,
        previewText,
        profiles: parsed.profiles.map(sanitizeProfile),
      };
    }
    return {
      ok: false,
      previewText,
      profiles: null,
      errorReason: '解密结果不符合平台备份格式（主密码可能不匹配）',
    };
  } catch {
    return {
      ok: false,
      previewText,
      profiles: null,
      errorReason: '主密码不匹配：解密内容为乱码，无法解析为有效配置',
    };
  }
}

export async function decryptBase64WithPreview(
  base64Text: string,
  masterPassword: string
): Promise<DecryptPreviewResult> {
  try {
    const bytes = base64ToBytes(base64Text);
    return await decryptBytesWithPreview(bytes, masterPassword);
  } catch {
    return {
      ok: false,
      previewText: '',
      profiles: null,
      errorReason: 'Base64 文本格式无效，请检查是否完整粘贴',
    };
  }
}
