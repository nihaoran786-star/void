import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  new URL('./AppLayout.minimal.scss', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

describe('minimal AppLayout presentation contract', () => {
  it('anchors desktop notifications to the content edge', () => {
    expect(stylesheet).toMatch(
      /\.void-app-layout\.void-ui--minimal ~ \.notification-container\s*\{[^}]*left:\s*auto;[^}]*right:\s*12px;[^}]*width:\s*min\(320px, calc\(100vw - 24px\)\);/s,
    );
  });

  it('preserves equal notification gutters on phone-sized viewports', () => {
    expect(stylesheet).toMatch(
      /@media \(max-width: 480px\)\s*\{\s*\.void-app-layout\.void-ui--minimal ~ \.notification-container\s*\{[^}]*left:\s*12px;[^}]*right:\s*12px;[^}]*width:\s*auto;/s,
    );
  });

  it('keeps persistent notifications mounted but visually paused behind modal focus', () => {
    expect(stylesheet).toMatch(
      /body:has\(\.void-app-layout\.void-ui--minimal\):has\(\.modal-overlay\) \.notification-container\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
    );
  });
});
