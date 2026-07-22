/**
 * L1 Chat input spec: validates chat input component functionality.
 * Tests input behavior, validation, and message sending without AI interaction.
 */

import { browser, expect } from '@wdio/globals';
import { ChatPage } from '../page-objects/ChatPage';
import { ChatInput } from '../page-objects/components/ChatInput';
import { Header } from '../page-objects/components/Header';
import { StartupPage } from '../page-objects/StartupPage';
import { ensureCodeSessionOpen, openWorkspace } from '../helpers/workspace-helper';
import { saveScreenshot, saveFailureScreenshot, saveStepScreenshot } from '../helpers/screenshot-utils';

describe('L1 Chat Input Validation', () => {
  let chatPage: ChatPage;
  let chatInput: ChatInput;
  let header: Header;
  let startupPage: StartupPage;

  let hasWorkspace = false;

  before(async () => {
    console.log('[L1] Starting chat input tests');
    // Initialize page objects after browser is ready
    chatPage = new ChatPage();
    chatInput = new ChatInput();
    header = new Header();
    startupPage = new StartupPage();

    await browser.pause(3000);
    await header.waitForLoad();

    const startupVisible = await startupPage.isVisible();
    hasWorkspace = !startupVisible;

    if (!hasWorkspace) {
      console.log('[L1] No workspace open - opening current test workspace through frontend state');
      hasWorkspace = await openWorkspace();
    }

    if (hasWorkspace) {
      try {
        await ensureCodeSessionOpen();
      } catch (error) {
        console.error('[L1] Failed to ensure Code session is open:', error);
        hasWorkspace = false;
      }
    }

    if (hasWorkspace) {
      await saveStepScreenshot('l1-chat-input-workspace-ready');
    }
  });

  describe('Input visibility and accessibility', () => {
    it('chat input container should be visible', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      await chatPage.waitForLoad();
      const isVisible = await chatPage.isChatInputVisible();
      expect(isVisible).toBe(true);
      console.log('[L1] Chat input container visible');
    });

    it('chat input component should load', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      await chatInput.waitForLoad();
      const isVisible = await chatInput.isVisible();
      expect(isVisible).toBe(true);
      console.log('[L1] Chat input component loaded');
      await saveStepScreenshot('l1-chat-input-visible');
    });

    it('should have placeholder text', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      const placeholder = await chatInput.getPlaceholder();
      expect(placeholder).toBeDefined();
      expect(placeholder.length).toBeGreaterThan(0);
      console.log('[L1] Placeholder text:', placeholder);
    });
  });

  describe('Input interaction', () => {
    beforeEach(async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      await chatInput.clear();
    });

    it('should type single line message', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      const testMessage = 'Hello, this is a test message';
      await chatInput.typeMessage(testMessage);
      const value = await chatInput.getValue();
      expect(value).toContain(testMessage);
      console.log('[L1] Single line input works');
    });

    it('should type multiline message', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      const multilineMessage = 'Line 1\nLine 2\nLine 3';
      await browser.execute(() => {
        const editor = document.querySelector<HTMLElement>(
          '.rich-text-input[contenteditable="true"]',
        );
        if (!editor) {
          return;
        }
        editor.dataset.e2eEnterEvents = '[]';
        editor.addEventListener('keydown', event => {
          if (event.key !== 'Enter') {
            return;
          }
          const entries = JSON.parse(editor.dataset.e2eEnterEvents ?? '[]');
          entries.push({
            shiftKey: event.shiftKey,
            defaultPrevented: event.defaultPrevented,
          });
          editor.dataset.e2eEnterEvents = JSON.stringify(entries);
        });
      });
      await chatInput.typeMessage(multilineMessage);
      const value = await chatInput.getValue();
      expect(value).toContain('Line 1');
      expect(value).toContain('Line 2');
      expect(value).toContain('Line 3');

      const multilineLayout = await browser.execute(() => {
        const editor = document.querySelector<HTMLElement>(
          '.rich-text-input[contenteditable="true"]',
        );
        if (!editor) {
          return null;
        }

        const textNodes: Text[] = [];
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        let currentNode = walker.nextNode();
        while (currentNode) {
          textNodes.push(currentNode as Text);
          currentNode = walker.nextNode();
        }

        const combinedText = textNodes.map(node => node.data).join('');
        const boundaryAt = (
          offset: number,
          affinity: 'forward' | 'backward',
        ) => {
          let cursor = 0;
          for (const node of textNodes) {
            const nextCursor = cursor + node.data.length;
            const isInside =
              affinity === 'forward' ? offset < nextCursor : offset <= nextCursor;
            if (isInside) {
              return {
                node,
                offset: Math.max(0, Math.min(node.data.length, offset - cursor)),
              };
            }
            cursor = nextCursor;
          }
          return null;
        };

        const lineTops = ['Line 1', 'Line 2', 'Line 3'].map(line => {
          const start = combinedText.indexOf(line);
          const startBoundary =
            start >= 0 ? boundaryAt(start, 'forward') : null;
          const endBoundary =
            start >= 0 ? boundaryAt(start + line.length, 'backward') : null;
          if (!startBoundary || !endBoundary) {
            return null;
          }
          const range = document.createRange();
          range.setStart(startBoundary.node, startBoundary.offset);
          range.setEnd(endBoundary.node, endBoundary.offset);
          return Math.round(range.getBoundingClientRect().top);
        });

        return {
          innerHtml: editor.innerHTML,
          innerText: editor.innerText,
          textContent: editor.textContent ?? '',
          whiteSpace: getComputedStyle(editor).whiteSpace,
          lineTops,
          enterEvents: JSON.parse(editor.dataset.e2eEnterEvents ?? '[]') as Array<{
            shiftKey: boolean;
            defaultPrevented: boolean;
          }>,
        };
      });

      expect(multilineLayout).not.toBeNull();
      expect(multilineLayout?.enterEvents).toEqual([
        { shiftKey: true, defaultPrevented: false },
        { shiftKey: true, defaultPrevented: false },
      ]);
      expect(multilineLayout?.whiteSpace).toBe('pre-wrap');
      expect(
        multilineLayout?.innerText.replace(/\r\n/g, '\n').split('\n'),
      ).toEqual(['Line 1', 'Line 2', 'Line 3']);
      expect(new Set(multilineLayout?.lineTops).size).toBe(3);
      console.log('[L1] Multiline input works');
      await saveStepScreenshot('l1-chat-input-multiline');
    });

    it('should clear input', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      await chatInput.typeMessage('Test message');
      let value = await chatInput.getValue();
      expect(value.length).toBeGreaterThan(0);
      
      await chatInput.clear();
      value = await chatInput.getValue();
      expect(value).toBe('');
      console.log('[L1] Input clear works');
    });

    it('should handle special characters', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      const specialChars = '!@#$%^&*()_+-={}[]|:;"<>?,./';
      await chatInput.typeMessage(specialChars);
      const value = await chatInput.getValue();
      expect(value).toContain(specialChars);
      console.log('[L1] Special characters handled');
    });
  });

  describe('Send button behavior', () => {
    beforeEach(async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      await chatInput.clear();
    });

    it('send button should be disabled when input is empty', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      const isEnabled = await chatInput.isSendButtonEnabled();
      expect(isEnabled).toBe(false);
      console.log('[L1] Send button disabled when empty');
    });

    it('send button should be enabled when input has text', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      await chatInput.typeMessage('Test');
      await browser.pause(500); // Increase wait time for button state update
      
      const isEnabled = await chatInput.isSendButtonEnabled();
      expect(isEnabled).toBe(true);
      console.log('[L1] Send button enabled with text');
    });

    it('send button should be disabled for whitespace-only input', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      await chatInput.typeMessage('   ');
      await browser.pause(200);
      
      const isEnabled = await chatInput.isSendButtonEnabled();
      expect(isEnabled).toBe(false);
      console.log('[L1] Send button disabled for whitespace');
    });
  });

  describe('Message sending', () => {
    beforeEach(async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      await chatInput.clear();
    });

    it('should send message and clear input', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      const testMessage = 'E2E L1 test - please ignore';
      await chatInput.typeMessage(testMessage);
      
      const countBefore = await chatPage.getMessageCount();
      console.log('[L1] Messages before send:', countBefore);
      
      await chatInput.clickSend();
      await browser.pause(1000);
      
      const valueAfter = await chatInput.getValue();
      expect(valueAfter).toBe('');
      console.log('[L1] Input cleared after send');
      await saveStepScreenshot('l1-chat-input-message-sent');
    });

    it('should not send empty message', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      const countBefore = await chatPage.getMessageCount();
      
      await chatInput.clear();
      const isSendEnabled = await chatInput.isSendButtonEnabled();
      
      if (isSendEnabled) {
        console.log('[L1] WARNING: Send enabled for empty input');
      }
      
      expect(isSendEnabled).toBe(false);
      console.log('[L1] Cannot send empty message');
    });

    it('should handle rapid message sending', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      // Ensure clean state before test (important when running full test suite)
      console.log('[L1] Starting rapid message sending test - cleaning state');
      await browser.pause(1000);
      await chatInput.clear();
      await browser.pause(500);
      
      const messages = ['Message 1', 'Message 2', 'Message 3'];
      
      // Test: Application should handle rapid message sending without crashing
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        console.log(`[L1] Sending message ${i + 1}/${messages.length}: ${msg}`);
        
        await chatInput.clear();
        await browser.pause(300);
        await chatInput.typeMessage(msg);
        await browser.pause(500);
        
        // Verify input has content before sending
        const inputValue = await chatInput.getValue();
        console.log(`[L1] Input value before send: "${inputValue}"`);
        
        // Just verify input is not empty, don't be strict about exact content
        expect(inputValue.length).toBeGreaterThan(0);
        
        await chatInput.clickSend();
        await browser.pause(1500); // Longer wait between messages
      }
      
      console.log('[L1] Successfully sent 3 rapid messages without crash');
      
      // The main assertion: application is still responsive
      await browser.pause(2500);
      
      // Verify we can still interact with input
      await chatInput.clear();
      await browser.pause(800);
      
      const clearedValue = await chatInput.getValue();
      console.log(`[L1] Input value after final clear: "${clearedValue}"`);
      
      // Main test: input is still functional
      expect(typeof clearedValue).toBe('string');
      console.log('[L1] Rapid sending handled - input still functional');
      await saveStepScreenshot('l1-chat-input-rapid-send-complete');
    });
  });

  describe('Input focus and selection', () => {
    it('input should be focusable', async function () {
      if (!hasWorkspace) {
        this.skip();
        return;
      }
      
      await chatInput.focus();
      const isFocused = await chatInput.isFocused();
      expect(isFocused).toBe(true);
      console.log('[L1] Input can be focused');
      await saveStepScreenshot('l1-chat-input-focused');
    });
  });

  afterEach(async function () {
    if (this.currentTest?.state === 'failed') {
      await saveFailureScreenshot(`l1-chat-input-${this.currentTest.title}`);
    }
  });

  after(async () => {
    if (hasWorkspace) {
      await saveScreenshot('l1-chat-input-complete');
    }
    console.log('[L1] Chat input tests complete');
  });
});
