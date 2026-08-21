/**
 * Read-only projection of the MCP connector catalog.
 *
 * `McpToolsConfig` stays the owner of every connector mutation (start/stop,
 * auth, JSON editing). This module only exposes the list it already reads, so
 * other presentation surfaces can show the same connectors without duplicating
 * transport access: everything still goes through `MCPAPI`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MCPAPI, type MCPServerInfo } from '../../api/service-api/MCPAPI';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('mcpServerCatalog');

type CatalogStatusFilter = 'all' | 'connected' | 'attention' | 'stopped';

export type CatalogStatusGroup = Exclude<CatalogStatusFilter, 'all'> | 'transitioning';

/** Collapses the runtime status string into the four groups the UI presents. */
export function getCatalogStatusGroup(status: string): CatalogStatusGroup {
  switch (status.trim().toLowerCase()) {
    case 'connected':
    case 'healthy':
      return 'connected';
    case 'uninitialized':
    case 'stopped':
      return 'stopped';
    case 'starting':
    case 'reconnecting':
    case 'stopping':
      return 'transitioning';
    case 'needsauth':
    case 'failed':
    default:
      return 'attention';
  }
}

export const MCP_SERVERS_LOAD_TIMEOUT_MS = 15_000;

export interface McpServerCatalogResult {
  servers: MCPServerInfo[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Loads the installed MCP servers once per mount. Read-only: no start, stop or
 * config write ever happens here.
 */
export function useMcpServerCatalog(): McpServerCatalogResult {
  const [servers, setServers] = useState<MCPServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const serverList = await Promise.race([
        MCPAPI.getServers(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('MCP servers load timed out')),
            MCP_SERVERS_LOAD_TIMEOUT_MS,
          ),
        ),
      ]);
      if (requestId !== requestIdRef.current) return;
      setServers(serverList);
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      log.error('Failed to load MCP servers', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  return { servers, loading, error, reload };
}
