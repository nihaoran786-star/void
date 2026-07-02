export function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
    if (!parsed.hostname) {
      throw new Error('Missing hostname');
    }
  } catch (e) {
    throw new Error(`Invalid URL: ${url}${e instanceof Error ? ` (${e.message})` : ''}`);
  }
}

export function shouldSkipConnectivityCheck(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const normalizedHostname = hostname.toLowerCase();
    return (
      normalizedHostname === 'localhost' ||
      normalizedHostname === '::1' ||
      normalizedHostname === '[::1]' ||
      normalizedHostname.startsWith('127.')
    );
  } catch {
    return false;
  }
}

interface CheckConnectivityOptions {
  skipLoopbackCheck?: boolean;
}

export async function checkConnectivity(url: string, options: CheckConnectivityOptions = {}): Promise<void> {
  if (options.skipLoopbackCheck && shouldSkipConnectivityCheck(url)) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
  } catch {
    throw new Error(`Connection failed: ${new URL(url).hostname} is not reachable`);
  } finally {
    clearTimeout(timeout);
  }
}
