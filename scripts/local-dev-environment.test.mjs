import assert from 'node:assert/strict';
import test from 'node:test';
import localDevEnvironment from './local-dev-environment.cjs';

const { createLocalDevEnvironment } = localDevEnvironment;

test('uses the reachable IPv4 loopback host by default on Windows', () => {
  const environment = createLocalDevEnvironment({
    HTTP_PROXY: 'http://127.0.0.1:10808',
    NO_PROXY: 'example.test',
  }, 'win32');

  assert.equal(environment.TAURI_DEV_HOST, '127.0.0.1');
  assert.equal(environment.NO_PROXY, 'example.test,localhost,127.0.0.1,::1');
  assert.equal(environment.no_proxy, environment.NO_PROXY);
  assert.equal(environment.HTTP_PROXY, 'http://127.0.0.1:10808');
});

test('keeps an explicit host and merges both no-proxy variables without duplicates', () => {
  const environment = createLocalDevEnvironment({
    TAURI_DEV_HOST: '0.0.0.0',
    NO_PROXY: 'localhost,api.example.test',
    no_proxy: 'api.example.test,127.0.0.1',
  }, 'linux');

  assert.equal(environment.TAURI_DEV_HOST, '0.0.0.0');
  assert.equal(environment.NO_PROXY, 'localhost,api.example.test,127.0.0.1,::1');
  assert.equal(environment.no_proxy, environment.NO_PROXY);
});

test('keeps localhost as the non-Windows default host', () => {
  const environment = createLocalDevEnvironment({}, 'darwin');

  assert.equal(environment.TAURI_DEV_HOST, 'localhost');
  assert.equal(environment.NO_PROXY, 'localhost,127.0.0.1,::1');
});
