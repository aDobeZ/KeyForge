declare const chrome:
  | {
      tabs?: {
        query: (queryInfo: {
          active: boolean;
          currentWindow: boolean;
        }) => Promise<Array<{ url?: string; windowId?: number }>>;
      };
      sidePanel?: {
        open?: (options: { windowId: number }) => Promise<void>;
      };
      windows?: {
        create?: (options: {
          url: string;
          type: string;
          width: number;
          height: number;
        }) => Promise<unknown>;
      };
    }
  | undefined;

export function isExtensionEnvironment(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome?.tabs?.query);
}

export function isSidePanelContext(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('mode') === 'sidepanel';
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

/**
 * Pin the extension to Chrome/Edge Side Panel (or fallback to an always-separate popup window)
 * so interacting with web page inputs does not auto-close KeyForge.
 */
export async function pinToSidePanel(): Promise<boolean> {
  if (!isExtensionEnvironment()) return false;
  try {
    if (chrome?.sidePanel?.open) {
      const tabs = await chrome!.tabs!.query({ active: true, currentWindow: true });
      const windowId = tabs?.[0]?.windowId;
      if (typeof windowId === 'number') {
        await chrome.sidePanel.open({ windowId });
        window.close();
        return true;
      }
    }
    if (chrome?.windows?.create) {
      await chrome.windows.create({
        url: 'index.html?mode=sidepanel',
        type: 'popup',
        width: 420,
        height: 680,
      });
      window.close();
      return true;
    }
  } catch {
    // Fallback if sidePanel.open is unavailable
    if (chrome?.windows?.create) {
      try {
        await chrome.windows.create({
          url: 'index.html?mode=sidepanel',
          type: 'popup',
          width: 420,
          height: 680,
        });
        window.close();
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}
