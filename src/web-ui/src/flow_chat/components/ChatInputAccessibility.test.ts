import { describe, expect, it } from 'vitest';
import { readSourceText } from '@/test-utils/sourceText';

const readSource = () => readSourceText(
  new URL('./ChatInput.tsx', import.meta.url),
);

const readSkillsSubmenuSource = () => readSourceText(
  new URL('./BoostSkillsSubmenu.tsx', import.meta.url),
);

const readActionButtonSource = () => readSourceText(
  new URL('./ComposerActionButton.tsx', import.meta.url),
);

describe('ChatInput accessibility contract', () => {
  it('exposes every stop-generation action as a named native button', () => {
    const source = readActionButtonSource();
    const cancelButtons = source.match(
      /<button[\s\S]*?aria-label=\{cancelLabel\}[\s\S]*?data-testid="chat-input-cancel-btn"[\s\S]*?<\/button>/g,
    );

    expect(cancelButtons).toHaveLength(2);
  });

  it('gives the primary composer the localized accessible name', () => {
    const source = readSource();

    expect(source).toContain("aria-label={t('input.placeholder')}");
  });

  it('keeps workspace and usage controls inside the primary composer box', () => {
    const source = readSource();
    const stripIndex = source.lastIndexOf('<ChatInputWorkspaceStrip');
    const boxCloseIndex = source.indexOf(
      '          </div>\n        </div>\n      </div>\n    </ContextDropZone>',
      stripIndex,
    );

    expect(stripIndex).toBeGreaterThan(0);
    expect(boxCloseIndex).toBeGreaterThan(stripIndex);
  });

  it('names every icon-only send, retry, and boost action', () => {
    const source = readSource();
    const actionSource = readActionButtonSource();

    expect(actionSource.match(/aria-label=\{sendLabel\}/g)).toHaveLength(3);
    expect(actionSource.match(/aria-label=\{retryLabel\}/g)).toHaveLength(1);
    expect(source.match(/aria-label=\{t\('chatInput\.addBoostTooltip'\)\}/g)).toHaveLength(1);
  });

  it('keeps the Skills flyout reachable and navigable from the keyboard', () => {
    const source = readSkillsSubmenuSource();

    expect(source).toContain('ref={triggerRef}');
    expect(source).toContain('aria-controls={menuId}');
    expect(source).toContain('onKeyDown={handleKeyDown}');
    expect(source).toContain('data-skills-flyout-item');
    expect(source).toContain('closeImmediately(true)');
  });

  it('supports independent main and child composers through explicit session bindings', () => {
    const source = readSource();

    expect(source).toContain('sessionId?: string;');
    expect(source).toContain('parentSessionId?: string;');
    expect(source).toContain('targetSessionId: sessionId');
    expect(source).toContain('data-composer-session-id={effectiveTargetSessionId || undefined}');
    expect(source).toContain(
      "composerTarget.status === 'ready' ? composerTarget.sessionId : null",
    );
    expect(source).not.toContain('data-testid="chat-input-target-switcher"');
    expect(source).not.toContain('selectMainComposerTarget');
    expect(source).not.toContain('selectActiveChildComposerTarget');
  });

  it('routes action rendering and all new submissions through the shared customization guard', () => {
    const source = readSource();
    expect(source).toContain('<ComposerActionButton');
    expect(source).toContain(
      'customizationPersistencePending={customizationPersistencePending}',
    );
    expect(source).toContain('isCustomizationPersistencePending()');
    expect(source).toContain("isComposerActionAllowed(");
  });
});
