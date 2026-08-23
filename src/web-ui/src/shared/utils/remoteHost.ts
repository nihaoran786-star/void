/**
 * The backend records `workspace_hostname` for every session — `localhost`
 * for local workspaces, the SSH host for remote ones. Only a non-local value
 * may be treated as an SSH remote host; mapping `localhost` into
 * `remoteSshHost` turns every local session into a "disconnected remote".
 */
export function asRemoteSshHost(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    !normalized
    || normalized === 'localhost'
    || normalized.startsWith('localhost:')
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.0.0.1:')
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized.startsWith('[::1]:')
  ) {
    return undefined;
  }
  return value.trim();
}
