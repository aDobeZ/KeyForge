/**
 * LessPass v2 compatible deterministic password generator
 * with support for custom symbol subsets per site profile.
 */

export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const DEFAULT_SYMBOLS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

export type RuleName = 'lowercase' | 'uppercase' | 'digits' | 'symbols';

export interface PasswordOptions {
  site: string;
  login: string;
  counter: number;
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  customSymbols?: string;
}

export const DEFAULT_OPTIONS: Omit<PasswordOptions, 'site' | 'login'> = {
  counter: 1,
  length: 16,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  customSymbols: DEFAULT_SYMBOLS,
};

/**
 * Normalize custom symbols: deduplicate and order deterministically
 * (preserving DEFAULT_SYMBOLS order first, then any extra chars sorted by code point)
 * so that selecting all default symbols yields exact DEFAULT_SYMBOLS.
 */
export function normalizeSymbols(raw?: string): string {
  if (raw === undefined) return DEFAULT_SYMBOLS;
  const unique = new Set<string>(Array.from(raw));
  if (unique.size === 0) return '';

  const ordered: string[] = [];
  for (const ch of DEFAULT_SYMBOLS) {
    if (unique.has(ch)) {
      ordered.push(ch);
      unique.delete(ch);
    }
  }
  if (unique.size > 0) {
    const extras = Array.from(unique).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
    ordered.push(...extras);
  }
  return ordered.join('');
}

function getCharacterSubsets(customSymbols?: string): Record<RuleName, string> {
  return {
    lowercase: LOWERCASE,
    uppercase: UPPERCASE,
    digits: DIGITS,
    symbols: normalizeSymbols(customSymbols),
  };
}

export function getConfiguredRules(options: PasswordOptions): RuleName[] {
  const subsets = getCharacterSubsets(options.customSymbols);
  const candidateRules: RuleName[] = ['lowercase', 'uppercase', 'digits', 'symbols'];
  return candidateRules.filter((rule) => options[rule] && subsets[rule].length > 0);
}

function divmod(dividend: bigint, divisor: bigint): [bigint, bigint] {
  return [dividend / divisor, dividend % divisor];
}

function consumeEntropy(
  generatedPassword: string,
  quotient: bigint,
  setOfCharacters: string,
  maxLength: number
): { value: string; entropy: bigint } {
  let pwd = generatedPassword;
  let q = quotient;
  const len = BigInt(setOfCharacters.length);

  while (pwd.length < maxLength) {
    const [nextQ, remainder] = divmod(q, len);
    pwd += setOfCharacters[Number(remainder)];
    q = nextQ;
  }

  return { value: pwd, entropy: q };
}

function getOneCharPerRule(
  entropy: bigint,
  rules: RuleName[],
  subsets: Record<RuleName, string>
): { value: string; entropy: bigint } {
  let oneCharPerRule = '';
  let currentEntropy = entropy;

  for (const rule of rules) {
    const charset = subsets[rule];
    const [nextEntropy, remainder] = divmod(currentEntropy, BigInt(charset.length));
    oneCharPerRule += charset[Number(remainder)];
    currentEntropy = nextEntropy;
  }

  return { value: oneCharPerRule, entropy: currentEntropy };
}

function insertStringPseudoRandomly(
  generatedPassword: string,
  entropy: bigint,
  charsToInsert: string
): string {
  let pwd = generatedPassword;
  let currentEntropy = entropy;

  for (let i = 0; i < charsToInsert.length; i++) {
    if (pwd.length === 0) {
      pwd = charsToInsert[i];
      continue;
    }
    const [nextEntropy, remainder] = divmod(currentEntropy, BigInt(pwd.length));
    const pos = Number(remainder);
    pwd = pwd.slice(0, pos) + charsToInsert[i] + pwd.slice(pos);
    currentEntropy = nextEntropy;
  }

  return pwd;
}

/**
 * Derive 256-bit entropy using PBKDF2-HMAC-SHA256 (100,000 iterations)
 * matching LessPass v2 specification.
 */
export async function calcEntropy(
  site: string,
  login: string,
  masterPassword: string,
  counter: number
): Promise<string> {
  const encoder = new TextEncoder();
  const salt = `${site}${login}${counter.toString(16)}`;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const bytes = new Uint8Array(derivedBits);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Render deterministic password from 256-bit hex entropy and password options.
 */
export function renderPassword(entropyHex: string, options: PasswordOptions): string {
  const rules = getConfiguredRules(options);
  if (rules.length === 0) {
    throw new Error('至少需要启用一种字符类型（小写、大写、数字或特殊符号）');
  }
  const length = Math.max(rules.length, Math.min(35, Math.floor(options.length)));
  const subsets = getCharacterSubsets(options.customSymbols);
  const setOfCharacters = rules.map((r) => subsets[r]).join('');

  const initialEntropy = BigInt('0x' + entropyHex);
  const password = consumeEntropy('', initialEntropy, setOfCharacters, length - rules.length);
  const charactersToAdd = getOneCharPerRule(password.entropy, rules, subsets);

  return insertStringPseudoRandomly(password.value, charactersToAdd.entropy, charactersToAdd.value);
}

/**
 * High-level API: generate password directly from master password and options.
 */
export async function generatePassword(
  masterPassword: string,
  options: PasswordOptions
): Promise<string> {
  const counter = Math.max(1, Math.floor(options.counter));
  const entropyHex = await calcEntropy(options.site, options.login, masterPassword, counter);
  return renderPassword(entropyHex, { ...options, counter });
}

export interface FingerprintItem {
  iconIndex: number;
  color: string;
}

const FINGERPRINT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

/**
 * Compute 3 deterministic visual fingerprint items from the master password
 * so the user can visually confirm they typed their master password correctly.
 */
export async function getMasterPasswordFingerprint(
  masterPassword: string
): Promise<FingerprintItem[]> {
  if (!masterPassword) return [];
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(''));
  const bytes = new Uint8Array(sig);

  return [0, 1, 2].map((i) => ({
    iconIndex: bytes[i * 2] % 12,
    color: FINGERPRINT_COLORS[bytes[i * 2 + 1] % FINGERPRINT_COLORS.length],
  }));
}
