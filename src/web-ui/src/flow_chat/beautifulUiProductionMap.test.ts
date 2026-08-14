import { describe, expect, it } from 'vitest';
import {
  BEAUTIFUL_UI_PRODUCTION_COMPONENTS,
  getBeautifulUIToolComponent,
} from './beautifulUiProductionMap';

describe('Beautiful UI production mapping', () => {
  it('keeps all 19 original source components in the production contract', () => {
    expect(new Set(BEAUTIFUL_UI_PRODUCTION_COMPONENTS).size).toBe(19);
  });

  it('maps the corresponding Flow Chat tools without changing the registry', () => {
    expect(getBeautifulUIToolComponent('Read')).toBe('context-cards');
    expect(getBeautifulUIToolComponent('Task')).toBe('task-rows');
    expect(getBeautifulUIToolComponent('AskUserQuestion')).toBe('approval-card');
    expect(getBeautifulUIToolComponent('mcp__filesystem__read_file')).toBe('tool-chips');
  });
});
