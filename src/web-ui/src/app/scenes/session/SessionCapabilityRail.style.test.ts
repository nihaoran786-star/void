import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SessionCapabilityRail.scss', import.meta.url),
  'utf8',
);

describe('SessionCapabilityRail visual contract', () => {
  it('keeps the rail tiny at rest and reveals team context only on interaction', () => {
    expect(source).toMatch(
      /\.session-capability-rail \{[\s\S]*?width: 36px;[\s\S]*?&:hover \{[\s\S]*?width: 148px;/,
    );
    expect(source).toMatch(
      /\.short-drama-team-panel-controls__copy \{[\s\S]*?display: none;/,
    );
    expect(source).toMatch(
      /\.session-capability-rail:hover \{[\s\S]*?\.short-drama-team-panel-controls__copy \{[\s\S]*?display: flex;/,
    );
  });

  it('separates teams from tools and exposes count, status, and active state', () => {
    expect(source).toMatch(
      /\.session-capability-rail__team-outlet[\s\S]*?&:not\(:empty\)[\s\S]*?border-top:/,
    );
    expect(source).toMatch(
      /\.short-drama-team-panel-controls__summary-count \{[\s\S]*?position: absolute;[\s\S]*?border-radius: 999px;/,
    );
    expect(source).toMatch(
      /\.short-drama-team-panel-controls__summary[\s\S]*?&\.is-expanded \{[\s\S]*?border-color: var\(--workspace-accent/,
    );
    expect(source).toContain(
      '.short-drama-team-panel-controls__status-dot',
    );
  });

  it('reserves transcript space and keeps compact panes icon-only', () => {
    expect(source).toMatch(
      /\.void-session-scene__chat-pane:has\(\.session-capability-rail\)[\s\S]*?\.modern-flowchat-container__messages[\s\S]*?padding-right: 52px;/,
    );
    expect(source).toMatch(
      /@container session-chat-pane \(max-width: 960px\)[\s\S]*?\.session-capability-rail:hover[\s\S]*?width: 36px;/,
    );
    expect(source).toMatch(
      /@container session-chat-pane \(max-width: 960px\)[\s\S]*?\.session-capability-rail__copy[\s\S]*?display: none;/,
    );
  });
});
