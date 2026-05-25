import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkConnectivity,
  shouldSkipConnectivityCheck,
  validateUrl,
} from './browserUrlCheck';

describe('browserUrlCheck', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('skips connectivity checks for localhost URLs when requested by an embedded browser panel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(shouldSkipConnectivityCheck('http://localhost:5173')).toBe(true);
    await checkConnectivity('http://localhost:5173', { skipLoopbackCheck: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips connectivity checks for IPv4 loopback URLs when requested by an embedded browser panel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(shouldSkipConnectivityCheck('http://127.0.0.1:5173')).toBe(true);
    await checkConnectivity('http://127.0.0.1:5173', { skipLoopbackCheck: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips connectivity checks for IPv6 loopback URLs when requested by an embedded browser panel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(shouldSkipConnectivityCheck('http://[::1]:5173')).toBe(true);
    await checkConnectivity('http://[::1]:5173', { skipLoopbackCheck: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the existing fetch check for loopback URLs by default', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await checkConnectivity('http://127.0.0.1:5173');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:5173',
      expect.objectContaining({
        method: 'HEAD',
        mode: 'no-cors',
      })
    );
  });

  it('keeps the existing fetch check for non-local URLs', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(shouldSkipConnectivityCheck('https://example.com')).toBe(false);
    await checkConnectivity('https://example.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'HEAD',
        mode: 'no-cors',
      })
    );
  });

  it('still rejects unsupported URL protocols', () => {
    expect(() => validateUrl('file:///tmp/index.html')).toThrow('Unsupported protocol');
  });
});
