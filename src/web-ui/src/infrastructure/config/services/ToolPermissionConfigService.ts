import { globalEventBus } from '@/infrastructure/event-bus';
import { configAPI } from '@/infrastructure/api/service-api/ConfigAPI';
import type {
  ToolPermissionConfig,
  ToolPermissionMode,
  ToolPermissionRule,
} from '../types';
import { configManager } from './ConfigManager';

export const DEFAULT_TOOL_PERMISSION_CONFIG: ToolPermissionConfig = {
  mode: 'ask',
  rules: [],
};

const MODES = new Set<ToolPermissionMode>(['ask', 'auto', 'full_access']);
const DECISIONS = new Set(['allow', 'ask', 'deny']);

function normalizeRule(value: unknown): ToolPermissionRule | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ToolPermissionRule>;
  if (
    typeof candidate.tool !== 'string'
    || !candidate.tool.trim()
    || !DECISIONS.has(candidate.decision ?? '')
  ) {
    return null;
  }
  return {
    ...(typeof candidate.id === 'string' && candidate.id.trim()
      ? { id: candidate.id.trim() }
      : {}),
    tool: candidate.tool.trim(),
    ...(typeof candidate.intent === 'string' && candidate.intent.trim()
      ? { intent: candidate.intent.trim() }
      : {}),
    decision: candidate.decision!,
  };
}

export function normalizeToolPermissionConfig(value: unknown): ToolPermissionConfig {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_TOOL_PERMISSION_CONFIG };
  }
  const candidate = value as Partial<ToolPermissionConfig>;
  const mode = MODES.has(candidate.mode as ToolPermissionMode)
    ? candidate.mode as ToolPermissionMode
    : 'ask';
  const rules = Array.isArray(candidate.rules)
    ? candidate.rules.map(normalizeRule).filter((rule): rule is ToolPermissionRule => rule !== null)
    : [];
  return { mode, rules };
}

class ToolPermissionConfigService {
  async loadConfig(): Promise<ToolPermissionConfig> {
    const typed = await configManager.getOptionalConfig<unknown>('ai.tool_permissions');
    if (typed !== undefined) {
      return normalizeToolPermissionConfig(typed);
    }
    const skipConfirmation = await configManager.getConfig<boolean>('ai.skip_tool_confirmation');
    return {
      mode: skipConfirmation ? 'auto' : 'ask',
      rules: [],
    };
  }

  async saveMode(
    mode: ToolPermissionMode,
    current?: ToolPermissionConfig,
  ): Promise<ToolPermissionConfig> {
    const latest = await configAPI.getConfig(
      'ai.tool_permissions',
      { skipRetryOnNotFound: true },
    );
    const next = {
      ...normalizeToolPermissionConfig(latest ?? current),
      mode,
    };
    await configManager.setConfig('ai.tool_permissions', next);
    globalEventBus.emit('permission:config:updated', next);
    globalEventBus.emit('mode:config:updated');
    return next;
  }
}

export const toolPermissionConfigService = new ToolPermissionConfigService();
