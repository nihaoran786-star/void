import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  fileURLToPath(new URL('./Modal.scss', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('Modal visual isolation contract', () => {
  it('fades only the backdrop so modal content never becomes translucent', () => {
    expect(stylesheet).toContain(
      'animation: modal-backdrop-enter 0.25s ease;',
    );
    expect(stylesheet).toMatch(
      /@keyframes modal-backdrop-enter\s*\{\s*from\s*\{\s*background-color:\s*rgba\(0,\s*0,\s*0,\s*0\);/,
    );

    for (const keyframe of [
      'modal-dialog-enter',
      'modal-dialog-enter-bottom',
    ]) {
      const block = stylesheet.match(
        new RegExp(
          `@keyframes ${keyframe}([\\s\\S]*?)(?=\\n@keyframes|\\n\\.modal|$)`,
        ),
      )?.[1];

      expect(block).toBeDefined();
      expect(block).not.toMatch(/\bopacity\s*:/);
    }
  });
});
