const LOCAL_NO_PROXY_HOSTS = ['localhost', '127.0.0.1', '::1'];

function splitNoProxyEntries(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createLocalDevEnvironment(baseEnv = process.env, platform = process.platform) {
  const existingNoProxyEntries = [
    ...splitNoProxyEntries(baseEnv.NO_PROXY),
    ...splitNoProxyEntries(baseEnv.no_proxy),
  ];
  const noProxyEntries = Array.from(new Set([
    ...existingNoProxyEntries,
    ...LOCAL_NO_PROXY_HOSTS,
  ]));
  const noProxy = noProxyEntries.join(',');

  return {
    ...baseEnv,
    TAURI_DEV_HOST:
      baseEnv.TAURI_DEV_HOST || (platform === 'win32' ? '127.0.0.1' : 'localhost'),
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  };
}

module.exports = {
  createLocalDevEnvironment,
};
