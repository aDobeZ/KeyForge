declare const chrome:
  | {
      tabs?: {
        query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<Array<{ url?: string }>>;
      };
    }
  | undefined;

export function isExtensionEnvironment(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome?.tabs?.query);
}

/**
 * Extract clean domain/hostname from a URL (e.g. "https://www.github.com/login" -> "github.com")
 */
export function extractDomainFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export async function getActiveTabDomain(): Promise<string> {
  if (!isExtensionEnvironment()) return '';
  try {
    const tabs = await chrome!.tabs!.query({ active: true, currentWindow: true });
    const url = tabs?.[0]?.url;
    if (!url) return '';
    return extractDomainFromUrl(url);
  } catch {
    return '';
  }
}
