import { describe, expect, it } from 'vitest';
import type { ToolInfo } from '@/shared/types/agent-api';
import {
  buildAgentToolGroups,
  setCapabilityGroupEnabled,
  type ToolGroupLabels,
} from './agentCapabilityGroups';

const labels: ToolGroupLabels = {
  core: 'Core',
  on_demand: 'On demand',
  mcp: 'MCP',
  integration: 'Integrations',
};

function tool(
  name: string,
  options: Partial<ToolInfo> = {},
): ToolInfo {
  return {
    name,
    description: name,
    input_schema: {},
    is_readonly: true,
    is_concurrency_safe: true,
    needs_permissions: false,
    load_mode: 'expanded',
    ...options,
  };
}

describe('agent capability groups', () => {
  it('groups explicit core, on-demand, MCP, and integration tool metadata', () => {
    const groups = buildAgentToolGroups([
      tool('Read'),
      tool('WebFetch', { load_mode: 'on_demand' }),
      tool('GitHubSearch', {
        load_mode: 'on_demand',
        dynamic_info: {
          providerId: 'github',
          providerKind: 'mcp',
          mcp: { serverId: 'github', serverName: 'GitHub', toolName: 'search' },
        },
      }),
      tool('Calendar', {
        dynamic_info: { providerId: 'calendar', providerKind: 'integration' },
      }),
    ], ['Read', 'GitHubSearch'], labels);

    expect(groups.map((group) => group.key)).toEqual([
      'core',
      'on_demand',
      'mcp',
      'integration',
    ]);
    expect(groups.find((group) => group.key === 'core')).toMatchObject({
      enabledCount: 1,
      totalCount: 1,
      onDemandCount: 0,
    });
    expect(groups.find((group) => group.key === 'mcp')).toMatchObject({
      enabledCount: 1,
      totalCount: 1,
      onDemandCount: 1,
    });
  });

  it('keeps enabled entries first and applies group toggles without duplicates', () => {
    const [group] = buildAgentToolGroups(
      [tool('Write'), tool('Read')],
      ['Write'],
      labels,
    );
    expect(group.tools.map((item) => item.name)).toEqual(['Write', 'Read']);

    expect(setCapabilityGroupEnabled(['Read'], ['Read', 'Write'], true)).toEqual([
      'Read',
      'Write',
    ]);
    expect(setCapabilityGroupEnabled(['Read', 'Write', 'Bash'], ['Read', 'Write'], false))
      .toEqual(['Bash']);
  });
});
