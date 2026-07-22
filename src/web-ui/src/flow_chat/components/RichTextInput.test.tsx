import React, { act, createRef, forwardRef, useImperativeHandle, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import RichTextInput from './RichTextInput';
import type { ContextItem, FileContext } from '../../shared/types/context';

type HarnessHandle = {
  setValue: (value: string) => void;
};

const emptyContexts: ContextItem[] = [];

function placeCaretAtTextEnd(editor: HTMLDivElement) {
  const textNode = editor.firstChild;
  expect(textNode).toBeInstanceOf(Text);
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode!, textNode?.textContent?.length ?? 0);
  range.setEnd(textNode!, textNode?.textContent?.length ?? 0);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

let JSDOMCtor: (new (
  html?: string,
  options?: { pretendToBeVisual?: boolean }
) => { window: Window & typeof globalThis }) | null = null;

try {
  const jsdom = await import('jsdom');
  JSDOMCtor = jsdom.JSDOM as typeof JSDOMCtor;
} catch {
  JSDOMCtor = null;
}

const ControlledHarness = forwardRef<HarnessHandle>(function ControlledHarness(_, ref) {
  const [value, setValue] = useState('hello');

  useImperativeHandle(ref, () => ({
    setValue,
  }), []);

  return (
    <RichTextInput
      value={value}
      onChange={(nextValue) => setValue(nextValue)}
      contexts={emptyContexts}
      onRemoveContext={() => {}}
    />
  );
});

const describeWithJsdom = JSDOMCtor ? describe : describe.skip;

describeWithJsdom('RichTextInput external sync', () => {
  let dom: { window: Window & typeof globalThis };
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOMCtor!('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
    });

    const { window } = dom;
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('navigator', window.navigator);
    vi.stubGlobal('Node', window.Node);
    vi.stubGlobal('Text', window.Text);
    vi.stubGlobal('Element', window.Element);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    vi.stubGlobal('HTMLDivElement', window.HTMLDivElement);
    vi.stubGlobal('HTMLSpanElement', window.HTMLSpanElement);
    vi.stubGlobal('DocumentFragment', window.DocumentFragment);
    vi.stubGlobal('Range', window.Range);
    vi.stubGlobal('Selection', window.Selection);
    vi.stubGlobal('NodeFilter', window.NodeFilter);
    vi.stubGlobal('Event', window.Event);
    vi.stubGlobal('InputEvent', window.InputEvent);
    vi.stubGlobal('getSelection', window.getSelection.bind(window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    window.requestAnimationFrame = globalThis.requestAnimationFrame;
    window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

    document.execCommand = vi.fn((command: string, _showUi?: boolean, value?: string) => {
      if (command !== 'insertText') {
        return false;
      }
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return false;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(value ?? '');
      range.insertNode(textNode);
      range.setStart(textNode, textNode.textContent?.length ?? 0);
      range.setEnd(textNode, textNode.textContent?.length ?? 0);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }) as typeof document.execCommand;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  async function renderHarness(ref: React.RefObject<HarnessHandle>) {
    await act(async () => {
      root.render(<ControlledHarness ref={ref} />);
    });

    const editor = container.querySelector('.rich-text-input');
    expect(editor).toBeInstanceOf(HTMLDivElement);
    return editor as HTMLDivElement;
  }

  it('keeps the existing DOM node when parent echoes local input', async () => {
    const harnessRef = createRef<HarnessHandle>();
    const editor = await renderHarness(harnessRef);

    expect(editor.textContent).toBe('hello');
    const originalTextNode = editor.firstChild;
    expect(originalTextNode).toBeInstanceOf(Text);

    await act(async () => {
      (originalTextNode as Text).textContent = 'hello!';
      editor.dispatchEvent(new window.Event('input', { bubbles: true }));
    });

    expect(editor.textContent).toBe('hello!');
    expect(editor.firstChild).toBe(originalTextNode);
  });

  it('replaces the DOM node when value changes externally', async () => {
    const harnessRef = createRef<HarnessHandle>();
    const editor = await renderHarness(harnessRef);

    const originalTextNode = editor.firstChild;
    expect(originalTextNode).toBeInstanceOf(Text);

    await act(async () => {
      harnessRef.current?.setValue('server rewrite');
    });

    expect(editor.textContent).toBe('server rewrite');
    expect(editor.firstChild).not.toBe(originalTextNode);
  });

  it('keeps Escape owned by IME composition', async () => {
    const onKeyDown = vi.fn();

    await act(async () => {
      root.render(
        <RichTextInput
          value=""
          onChange={() => {}}
          onKeyDown={onKeyDown}
          contexts={emptyContexts}
          onRemoveContext={() => {}}
        />
      );
    });

    const editor = container.querySelector('.rich-text-input');
    expect(editor).toBeInstanceOf(HTMLDivElement);

    await act(async () => {
      editor!.dispatchEvent(new window.KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 229,
        bubbles: true,
      }));
    });

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('forwards standard div attributes to the editable root', async () => {
    await act(async () => {
      root.render(
        <RichTextInput
          value=""
          onChange={() => {}}
          contexts={emptyContexts}
          onRemoveContext={() => {}}
          data-testid="composer-input"
          aria-label="Composer input"
          spellCheck={false}
        />
      );
    });

    const editor = container.querySelector('.rich-text-input');
    expect(editor).toBeInstanceOf(HTMLDivElement);
    expect(editor?.getAttribute('data-testid')).toBe('composer-input');
    expect(editor?.getAttribute('aria-label')).toBe('Composer input');
    expect(editor?.getAttribute('role')).toBe('textbox');
    expect(editor?.getAttribute('aria-multiline')).toBe('true');
    expect(editor?.getAttribute('aria-disabled')).toBe('false');
    expect(editor?.getAttribute('spellcheck')).toBe('false');
  });

  it('preserves soft line breaks represented by contenteditable br nodes', async () => {
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <RichTextInput
          value=""
          onChange={onChange}
          contexts={emptyContexts}
          onRemoveContext={() => {}}
        />
      );
    });

    const editor = container.querySelector('.rich-text-input') as HTMLDivElement;
    editor.replaceChildren(
      document.createTextNode('Line 1'),
      document.createElement('br'),
      document.createTextNode('Line 2'),
      document.createElement('br'),
      document.createTextNode('Line 3'),
    );

    await act(async () => {
      editor.dispatchEvent(new window.Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenLastCalledWith(
      'Line 1\nLine 2\nLine 3',
      emptyContexts,
    );
  });

  it('opens mention with only the needed leading space', async () => {
    const onMentionStateChange = vi.fn();

    await act(async () => {
      root.render(
        <RichTextInput
          value="hello"
          onChange={() => {}}
          onMentionStateChange={onMentionStateChange}
          contexts={emptyContexts}
          onRemoveContext={() => {}}
        />
      );
    });

    const editor = container.querySelector('.rich-text-input') as HTMLDivElement;
    placeCaretAtTextEnd(editor);

    await act(async () => {
      (editor as any).openMention();
    });

    expect(editor.textContent).toBe('hello @');
    expect(onMentionStateChange).toHaveBeenLastCalledWith({
      isActive: true,
      query: '',
      startOffset: 6,
    });

    await act(async () => {
      root.render(
        <RichTextInput
          value="hello "
          onChange={() => {}}
          onMentionStateChange={onMentionStateChange}
          contexts={emptyContexts}
          onRemoveContext={() => {}}
        />
      );
    });

    placeCaretAtTextEnd(editor);

    await act(async () => {
      (editor as any).openMention();
    });

    expect(editor.textContent).toBe('hello @');
  });

  it('replaces a mention with one tag and one trailing space', async () => {
    const fileContext: FileContext = {
      id: 'file-1',
      type: 'file',
      filePath: '/repo/src/file.ts',
      fileName: 'file.ts',
      relativePath: 'src/file.ts',
      timestamp: 1,
    };
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <RichTextInput
          value="ask @fi"
          onChange={onChange}
          contexts={[fileContext]}
          onRemoveContext={() => {}}
        />
      );
    });

    const editor = container.querySelector('.rich-text-input') as HTMLDivElement;
    placeCaretAtTextEnd(editor);

    await act(async () => {
      editor.dispatchEvent(new window.Event('input', { bubbles: true }));
    });

    await act(async () => {
      (editor as any).insertTagReplacingMention(fileContext);
    });

    expect(editor.childNodes[0].textContent).toBe('ask ');
    expect(editor.childNodes[1]).toBeInstanceOf(HTMLSpanElement);
    expect((editor.childNodes[1] as HTMLElement).dataset.tagFormat).toBe('#file:file.ts');
    expect(Array.from(editor.childNodes).slice(2).map(node => node.textContent).join('')).toBe(' ');
    expect(onChange).toHaveBeenLastCalledWith('ask #file:file.ts', [fileContext]);
  });
});
