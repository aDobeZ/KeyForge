import { DEFAULT_OPTIONS, DEFAULT_SYMBOLS, normalizeSymbols } from './lesspass';

export interface SiteProfile {
  id: string;
  site: string;
  login: string;
  counter: number;
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  customSymbols: string;
  updatedAt: number;
}

const STORAGE_KEY = 'mylesspass_profiles_v1';

declare const chrome:
  | {
      storage?: {
        local?: {
          get: (keys: string[]) => Promise<Record<string, unknown>>;
          set: (items: Record<string, unknown>) => Promise<void>;
        };
      };
    }
  | undefined;

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome?.storage?.local?.get) &&
    Boolean(chrome?.storage?.local?.set)
  );
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeProfile(raw: Partial<SiteProfile>): SiteProfile {
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generateId(),
    site: typeof raw.site === 'string' ? raw.site.trim() : '',
    login: typeof raw.login === 'string' ? raw.login.trim() : '',
    counter: typeof raw.counter === 'number' && raw.counter >= 1 ? Math.floor(raw.counter) : DEFAULT_OPTIONS.counter,
    length:
      typeof raw.length === 'number' && raw.length >= 4 && raw.length <= 35
        ? Math.floor(raw.length)
        : DEFAULT_OPTIONS.length,
    lowercase: typeof raw.lowercase === 'boolean' ? raw.lowercase : DEFAULT_OPTIONS.lowercase,
    uppercase: typeof raw.uppercase === 'boolean' ? raw.uppercase : DEFAULT_OPTIONS.uppercase,
    digits: typeof raw.digits === 'boolean' ? raw.digits : DEFAULT_OPTIONS.digits,
    symbols: typeof raw.symbols === 'boolean' ? raw.symbols : DEFAULT_OPTIONS.symbols,
    customSymbols:
      typeof raw.customSymbols === 'string' ? normalizeSymbols(raw.customSymbols) : DEFAULT_SYMBOLS,
    updatedAt: typeof raw.updatedAt === 'number' && raw.updatedAt > 0 ? raw.updatedAt : Date.now(),
  };
}

export async function loadProfiles(): Promise<SiteProfile[]> {
  let rawList: unknown = null;

  if (hasChromeStorage()) {
    try {
      const result = await chrome!.storage!.local!.get([STORAGE_KEY]);
      if (Array.isArray(result[STORAGE_KEY])) {
        rawList = result[STORAGE_KEY];
      }
    } catch {
      // Fallback to localStorage
    }
  }

  if (!rawList && typeof localStorage !== 'undefined') {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (json) {
        rawList = JSON.parse(json);
      }
    } catch {
      rawList = null;
    }
  }

  if (!Array.isArray(rawList)) return [];

  return rawList
    .filter((item): item is Partial<SiteProfile> => Boolean(item && typeof item === 'object'))
    .map(sanitizeProfile)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function persistProfiles(profiles: SiteProfile[]): Promise<void> {
  const sorted = [...profiles].sort((a, b) => b.updatedAt - a.updatedAt);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      // Ignore storage quota issues in restricted contexts
    }
  }

  if (hasChromeStorage()) {
    try {
      await chrome!.storage!.local!.set({ [STORAGE_KEY]: sorted });
    } catch {
      // Ignore
    }
  }
}

export async function upsertProfile(
  input: Omit<SiteProfile, 'id' | 'updatedAt'> & { id?: string }
): Promise<{ profiles: SiteProfile[]; saved: SiteProfile }> {
  const profiles = await loadProfiles();
  const normalizedSite = input.site.trim();
  const normalizedLogin = input.login.trim();

  const existingIndex = profiles.findIndex((p) => {
    if (input.id && p.id === input.id) return true;
    return p.site.toLowerCase() === normalizedSite.toLowerCase() && p.login === normalizedLogin;
  });

  const now = Date.now();
  const saved = sanitizeProfile({
    ...input,
    id: existingIndex >= 0 ? profiles[existingIndex].id : input.id || generateId(),
    site: normalizedSite,
    login: normalizedLogin,
    updatedAt: now,
  });

  if (existingIndex >= 0) {
    profiles[existingIndex] = saved;
  } else {
    profiles.unshift(saved);
  }

  await persistProfiles(profiles);
  return { profiles: await loadProfiles(), saved };
}

export async function deleteProfile(id: string): Promise<SiteProfile[]> {
  const profiles = await loadProfiles();
  const next = profiles.filter((p) => p.id !== id);
  await persistProfiles(next);
  return next;
}

export async function mergeImportedProfiles(
  incoming: SiteProfile[],
  mode: 'merge' | 'replace'
): Promise<SiteProfile[]> {
  const sanitizedIncoming = incoming.map(sanitizeProfile);
  if (mode === 'replace') {
    await persistProfiles(sanitizedIncoming);
    return loadProfiles();
  }

  const current = await loadProfiles();
  const byKey = new Map<string, SiteProfile>();

  const makeKey = (p: SiteProfile) => `${p.site.toLowerCase()}\u0000${p.login}`;

  for (const p of current) {
    byKey.set(makeKey(p), p);
  }

  for (const p of sanitizedIncoming) {
    const key = makeKey(p);
    const existing = byKey.get(key);
    if (!existing || p.updatedAt >= existing.updatedAt) {
      byKey.set(key, {
        ...p,
        id: existing ? existing.id : p.id,
      });
    }
  }

  const merged = Array.from(byKey.values());
  await persistProfiles(merged);
  return loadProfiles();
}
