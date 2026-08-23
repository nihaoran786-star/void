import { describe, expect, it } from 'vitest';

import { asRemoteSshHost } from './remoteHost';

describe('asRemoteSshHost', () => {
  it('drops local hostnames recorded for local workspaces', () => {
    expect(asRemoteSshHost('localhost')).toBeUndefined();
    expect(asRemoteSshHost('LOCALHOST')).toBeUndefined();
    expect(asRemoteSshHost('localhost:22')).toBeUndefined();
    expect(asRemoteSshHost('127.0.0.1')).toBeUndefined();
    expect(asRemoteSshHost('[::1]')).toBeUndefined();
  });

  it('drops empty and non-string values', () => {
    expect(asRemoteSshHost('')).toBeUndefined();
    expect(asRemoteSshHost('   ')).toBeUndefined();
    expect(asRemoteSshHost(undefined)).toBeUndefined();
    expect(asRemoteSshHost(42)).toBeUndefined();
  });

  it('keeps real SSH hosts', () => {
    expect(asRemoteSshHost('build-server')).toBe('build-server');
    expect(asRemoteSshHost(' 192.168.1.20 ')).toBe('192.168.1.20');
    expect(asRemoteSshHost('my.remote.example')).toBe('my.remote.example');
  });
});
