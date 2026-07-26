import type { ToolInfo } from '@/shared/types/agent-api';

export type ToolGroupKey = 'core' | 'on_demand' | 'mcp' | 'integration';

export interface ToolGroupLabels {
  core: string;
  on_demand: string;
  mcp: string;
  integration: string;
}

export interface AgentToolGroup {
  key: ToolGroupKey;
  label: string;
  tools: ToolInfo[];
  enabledCount: number;
  totalCount: number;
  onDemandCount: number;
}

const TOOL_GROUP_ORDER: Record<ToolGroupKey, number> = {
  core: 0,
  on_demand: 1,
  mcp: 2,
  integration: 3,
};

function getToolGroupKey(tool: ToolInfo): ToolGroupKey {
  if (tool.dynamic_info?.mcp || tool.dynamic_info?.providerKind === 'mcp') {
    return 'mcp';
  }
  if (tool.dynamic_info) {
    return 'integration';
  }
  if (tool.load_mode === 'on_demand') {
    return 'on_demand';
  }
  return 'core';
}

export function buildAgentToolGroups(
  tools: ToolInfo[],
  enabledToolNames: string[],
  labels: ToolGroupLabels,
): AgentToolGroup[] {
  const enabled = new Set(enabledToolNames);
  const grouped = new Map<ToolGroupKey, ToolInfo[]>();

  for (const tool of tools) {
    const key = getToolGroupKey(tool);
    const entries = grouped.get(key);
    if (entries) {
      entries.push(tool);
    } else {
      grouped.set(key, [tool]);
    }
  }

  return [...grouped.entries()]
    .map(([key, groupTools]) => ({
      key,
      label: labels[key],
      tools: [...groupTools].sort((a, b) => {
        const enabledOrder = Number(enabled.has(b.name)) - Number(enabled.has(a.name));
        return enabledOrder || a.name.localeCompare(b.name);
      }),
      enabledCount: groupTools.filter((tool) => enabled.has(tool.name)).length,
      totalCount: groupTools.length,
      onDemandCount: groupTools.filter((tool) => tool.load_mode === 'on_demand').length,
    }))
    .sort((a, b) => TOOL_GROUP_ORDER[a.key] - TOOL_GROUP_ORDER[b.key]);
}

export function setCapabilityGroupEnabled(
  currentKeys: string[],
  groupKeys: string[],
  enabled: boolean,
): string[] {
  const groupKeySet = new Set(groupKeys);
  if (!enabled) {
    return currentKeys.filter((key) => !groupKeySet.has(key));
  }

  const next = [...currentKeys];
  for (const key of groupKeys) {
    if (!next.includes(key)) {
      next.push(key);
    }
  }
  return next;
}
