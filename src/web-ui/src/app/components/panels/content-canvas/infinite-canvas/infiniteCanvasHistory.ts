/**
 * The keyboard half of undo / redo on the board.
 *
 * Which key press means undo, and which targets own their own undo stack and
 * must be left alone. Both are statements about a browser, not about a
 * document, so they stayed here when the history model itself moved into the
 * canvas domain. That model is re-exported below, so every file that imported
 * undo from this path still does.
 */
export {
  applyHistoryEntryContent,
  captureUserEdit,
  emptyInfiniteCanvasHistory,
  INFINITE_CANVAS_HISTORY_LIMIT,
  pushHistoryEntry,
} from '@/shared/services/infinite-canvas';
export type {
  InfiniteCanvasHistoryApplication,
  InfiniteCanvasHistoryDirection,
  InfiniteCanvasHistoryEntry,
  InfiniteCanvasHistorySnapshot,
  InfiniteCanvasHistoryState,
} from '@/shared/services/infinite-canvas';

// —— Keyboard guard ————————————————————————————————————————————————————————

/**
 * True for targets that own their native undo stack (prompt boxes, the text
 * card editor, any contenteditable). Ctrl+Z inside one of them must stay the
 * browser's text undo — hijacking it would make prompt editing feel broken.
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    closest?: (selector: string) => unknown;
  };
  if (element.isContentEditable === true) return true;
  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return typeof element.closest === 'function'
    ? Boolean(element.closest('[contenteditable="true"]'))
    : false;
}

export type InfiniteCanvasHistoryShortcut = 'undo' | 'redo' | undefined;

/**
 * Maps a keyboard event onto a history action. Ctrl/Cmd+Z undoes,
 * Ctrl/Cmd+Shift+Z and Ctrl+Y redo (the Windows and mac idioms both work).
 */
export function historyShortcutFor(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): InfiniteCanvasHistoryShortcut {
  if (event.altKey) return undefined;
  if (!event.ctrlKey && !event.metaKey) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return undefined;
}

