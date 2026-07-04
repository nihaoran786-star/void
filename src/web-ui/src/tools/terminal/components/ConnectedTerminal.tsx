/**
 * Connected terminal component that streams a backend session.
 * Optimizations: debounced resize, post-resize refresh, visibility-aware sync.
 */

import React, { useEffect, useRef, useCallback, useState, memo } from 'react';
import { AlertCircle, RefreshCw, Terminal as TerminalIcon, Trash2 } from 'lucide-react';
import Terminal, { TerminalRef } from './Terminal';
import { useTerminal } from '../hooks/useTerminal';
import { registerTerminalActions, unregisterTerminalActions } from '../services/TerminalActionManager';
import {
  POWERSHELL_READLINE_PASTE_SEQUENCE,
  TerminalInputQueue,
  createResizeRepaintGuard,
  isStandaloneCursorPosition,
  resolveTerminalPaste,
  shouldUsePowerShellReadlinePaste,
  terminalReplayHasScreenText,
} from '../utils';
import { confirmWarning } from '@/component-library';
import { createLogger } from '@/shared/utils/logger';
import type { SessionResponse, TerminalReplayEvent } from '../types';
import './Terminal.scss';

const log = createLogger('ConnectedTerminal');

type TerminalOutputQueueItem =
  | { type: 'data'; data: string }
  | { type: 'resize'; cols: number; rows: number };

export interface ConnectedTerminalProps {
  sessionId: string;
  className?: string;
  autoFocus?: boolean;
  showToolbar?: boolean;
  showStatusBar?: boolean;
  /** Optional session data; fetched when omitted. */
  session?: SessionResponse;
  onClose?: () => void;
  onTitleChange?: (title: string) => void;
  onExit?: (exitCode?: number) => void;
}

const ConnectedTerminal: React.FC<ConnectedTerminalProps> = memo(({
  sessionId,
  className = '',
  autoFocus = true,
  showToolbar = false,
  showStatusBar = false,
  session: initialSession,
  onClose,
  onTitleChange,
  onExit,
}) => {
  const terminalRef = useRef<TerminalRef>(null);
  const [title, setTitle] = useState<string>(initialSession?.name || 'Terminal');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [isExited, setIsExited] = useState(false);
  const isExitedRef = useRef(false);

  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  // Buffer output until the terminal is ready.
  // Use a ref (not state) to avoid stale closure issues with isTerminalReady.
  const isTerminalReadyRef = useRef(false);
  const outputQueueRef = useRef<TerminalOutputQueueItem[]>([]);

  // After history replay, ConPTY sends absolute cursor-position commands (ESC[R;CH)
  // that reference its own coordinate system, which diverges from xterm.js after replay.
  // We let those commands pass through (to avoid side effects from redirecting them) and
  // instead restore the correct cursor position via write callbacks after each one.
  const postHistoryCursorRef = useRef<{ row: number; col: number; ignoreCount: number } | null>(null);

  // PTY dimensions stored with the history snapshot.
  // Used to resize xterm.js to the correct size before replaying history, so that
  // absolute cursor-position sequences in the history (e.g. ESC[27;1H) are not
  // clamped to the xterm.js default row count (24).
  const historyDimsRef = useRef<{ cols: number; rows: number } | null>(null);

  // While set to a positive value, Terminal's doXtermResize will refuse to shrink
  // the column count below this threshold.  Set during history flush so that the
  // CSS open-animation (which drives the terminal through many narrow intermediate
  // widths) cannot permanently truncate content written at the historical width.
  // Cleared when post-history cursor mode exits.
  const preventShrinkBelowColsRef = useRef<number>(0);
  const resizeRepaintGuardRef = useRef(createResizeRepaintGuard());

  const handleOutput = useCallback((data: string) => {
    // Post-history cursor restoration:
    // ConPTY sends standalone cursor-position commands after resize in its own coordinate
    // system. We let them pass through unmodified (redirecting them caused content side
    // effects) and instead snap the cursor back to the saved correct position via a
    // write callback after each one is processed by xterm.js.
    if (postHistoryCursorRef.current && postHistoryCursorRef.current.ignoreCount > 0) {
      const isCursorOnly = isStandaloneCursorPosition(data);
      if (isCursorOnly) {
        const cursor = postHistoryCursorRef.current;
        cursor.ignoreCount--;
        if (resizeRepaintGuardRef.current.shouldSkipOutput(data)) {
          return;
        }
        const restoreSeq = `\x1b[${cursor.row};${cursor.col}H`;
        if (!isTerminalReadyRef.current || !terminalRef.current) {
          outputQueueRef.current.push({ type: 'data', data });
          outputQueueRef.current.push({ type: 'data', data: restoreSeq });
          return;
        }
        const xterm = terminalRef.current.getTerminal?.();
        if (xterm) {
          // Write the original cursor move, then immediately queue the restore so
          // the visible cursor always lands at the correct history-end position.
          xterm.write(data, () => {
            xterm.write(restoreSeq);
          });
        } else {
          terminalRef.current.write(data);
          terminalRef.current.write(restoreSeq);
        }
        return;
      } else {
        // Real content arrived — cursor is already at correct position from last restore.
        postHistoryCursorRef.current = null;
        preventShrinkBelowColsRef.current = 0;
      }
    }

    if (resizeRepaintGuardRef.current.shouldSkipOutput(data)) {
      return;
    }

    if (!isTerminalReadyRef.current || !terminalRef.current) {
      outputQueueRef.current.push({ type: 'data', data });
      return;
    }
    terminalRef.current.write(data);
  }, []); // No state deps - reads from refs which are always current

  const flushOutputQueue = useCallback(() => {
    const queue = outputQueueRef.current;
    if (queue.length === 0) return;
    // Clear first to prevent orphaned items if new data arrives during flush
    outputQueueRef.current = [];
    const shouldProtectReplayWidth = terminalReplayHasScreenText(
      queue.filter((item): item is Extract<TerminalOutputQueueItem, { type: 'data' }> => item.type === 'data'),
    );

    // If we have historical PTY dimensions, resize xterm.js to the correct row
    // count before replaying content.  This prevents absolute cursor-position
    // sequences embedded in the history (e.g. ESC[27;1H) from being clamped to
    // xterm.js's default 24-row size, which would corrupt the rendered output.
    // We also lock doXtermResize against shrinking so that the CSS open-animation
    // (which passes through many narrow column counts) cannot permanently truncate
    // the history content that is about to be written at the historical width.
    const dims = historyDimsRef.current;
    if (dims) {
      const xterm = terminalRef.current?.getTerminal?.();
      if (xterm) {
        const targetRows = Math.max(xterm.rows, dims.rows);
        try {
          if (xterm.rows !== targetRows) {
            xterm.resize(xterm.cols, targetRows);
          }
        } catch { /* ignore */ }
        if (shouldProtectReplayWidth) {
          // Prevent doXtermResize from shrinking below the historical col width.
          preventShrinkBelowColsRef.current = dims.cols;
        }
      }
    }

    queue.forEach((item) => {
      if (item.type === 'resize') {
        const xterm = terminalRef.current?.getTerminal?.();
        if (xterm) {
          try {
            xterm.resize(item.cols, item.rows);
            if (shouldProtectReplayWidth) {
              preventShrinkBelowColsRef.current = Math.max(
                preventShrinkBelowColsRef.current,
                item.cols,
              );
            }
          } catch {
            // Ignore replay resize failures; subsequent data should still be written.
          }
        }
        return;
      }

      terminalRef.current?.write(item.data);
    });

    // After all history writes complete, save the cursor row so that subsequent
    // ConPTY cursor-only updates can be redirected to this correct position.
    const xterm = terminalRef.current?.getTerminal?.();
    if (xterm) {
      xterm.write('', () => {
        const cursorY = xterm.buffer.active.cursorY; // 0-indexed
        const cursorRow = cursorY + 1; // 1-indexed for ANSI
        if (cursorRow > 0) {
          const cursorCol = xterm.buffer.active.cursorX + 1; // 1-indexed
          postHistoryCursorRef.current = { row: cursorRow, col: cursorCol, ignoreCount: 10 };
        }
      });
    }
  }, []);

  const handleReady = useCallback(() => {
    // Backend ready event - terminal UI is already ready via handleTerminalReady
    // No need to flush queue again here
  }, []);

  const handleExit = useCallback((code?: number) => {
    isExitedRef.current = true;
    inputQueueRef.current?.clear();
    setExitCode(code ?? null);
    setIsExited(true);
    onExit?.(code);
  }, [onExit]);

  const handleError = useCallback((message: string) => {
    log.error('Terminal error', { sessionId, message });
  }, [sessionId]);

  const handleHistoryDims = useCallback((cols: number, rows: number) => {
    historyDimsRef.current = { cols, rows };
  }, []);

  const handleReplay = useCallback((events: TerminalReplayEvent[]) => {
    if (events.length === 0) {
      return;
    }

    historyDimsRef.current = null;
    resizeRepaintGuardRef.current.clear();

    events.forEach((event) => {
      outputQueueRef.current.push({ type: 'resize', cols: event.cols, rows: event.rows });
      if (event.data) {
        outputQueueRef.current.push({ type: 'data', data: event.data });
      }
    });

    if (isTerminalReadyRef.current) {
      flushOutputQueue();
    }
  }, [flushOutputQueue]);

  const {
    session,
    isLoading,
    error,
    write,
    resize,
    sendCtrlC,
    close,
    refresh,
  } = useTerminal({
    sessionId,
    autoConnect: true,
    onOutput: handleOutput,
    onReady: handleReady,
    onExit: handleExit,
    onError: handleError,
    onHistoryDims: handleHistoryDims,
    onReplay: handleReplay,
  });

  const writeRef = useRef(write);
  writeRef.current = write;

  const inputQueueRef = useRef<TerminalInputQueue | null>(null);
  if (!inputQueueRef.current) {
    inputQueueRef.current = new TerminalInputQueue(
      (data) => {
        if (isExitedRef.current) {
          return Promise.resolve();
        }
        return writeRef.current(data);
      },
      (err) => log.error('Write failed', { sessionId, error: err }),
    );
  }

  const handleData = useCallback((data: string) => {
    if (!isExitedRef.current) {
      inputQueueRef.current?.enqueue(data);
    }
  }, []);

  const handleResize = useCallback((cols: number, rows: number) => {
    const lastSize = lastSentSizeRef.current;
    if (lastSize && lastSize.cols === cols && lastSize.rows === rows) {
      return;
    }
    lastSentSizeRef.current = { cols, rows };

    // If post-history cursor mode is active, update the saved cursor position
    // ONLY when the terminal is growing (wider cols). Shrinking resizes may place
    // the cursor at a damaged/truncated position, so we ignore those updates.
    // Growing resizes simply add columns on the right; the cursor row/col stays valid.
    if (postHistoryCursorRef.current) {
      const xterm = terminalRef.current?.getTerminal?.();
      if (xterm && cols >= xterm.cols) {
        postHistoryCursorRef.current.row = xterm.buffer.active.cursorY + 1;
        postHistoryCursorRef.current.col = xterm.buffer.active.cursorX + 1;
      }
    }

    resize(cols, rows).then(() => {
      resizeRepaintGuardRef.current.markResize();
    }).catch(err => {
      log.error('Resize failed', { sessionId, cols, rows, error: err });
      lastSentSizeRef.current = null;
      resizeRepaintGuardRef.current.clear();
    });
  }, [resize, sessionId]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    onTitleChange?.(newTitle);
  }, [onTitleChange]);

  const handleTerminalReady = useCallback(() => {
    // Set the ref synchronously first so handleOutput immediately writes directly
    // instead of queuing. This eliminates the stale-closure window where new data
    // would be queued after flushOutputQueue() cleared the queue but before React
    // re-rendered and updated onOutputRef.current.
    isTerminalReadyRef.current = true;
    flushOutputQueue();
  }, [flushOutputQueue]);

  const handlePasteShortcut = useCallback(async (): Promise<boolean> => {
    if (isExitedRef.current || !shouldUsePowerShellReadlinePaste(session?.shellType ?? initialSession?.shellType)) {
      return false;
    }

    inputQueueRef.current?.enqueue(POWERSHELL_READLINE_PASTE_SEQUENCE);
    return true;
  }, [initialSession?.shellType, session?.shellType]);

  const handlePaste = useCallback(async (
    text: string,
    context: { bracketedPasteMode: boolean },
  ) => {
    if (isExitedRef.current) {
      return { allow: false as const };
    }

    return resolveTerminalPaste(text, {
      bracketedPasteMode: context.bracketedPasteMode,
      confirmMultiLinePaste: async ({ lineCount, preview }) => {
        const confirmed = await confirmWarning(
          'Paste multiple lines',
          `The clipboard contains ${lineCount} lines. Pasting multiple lines in a terminal may execute multiple commands.`,
          {
            confirmText: 'Paste',
            cancelText: 'Cancel',
            preview,
            previewMaxHeight: 150,
          },
        );

        return confirmed ? 'paste' : 'cancel';
      },
    });
  }, []);

  const handleSendCtrlC = useCallback(() => {
    sendCtrlC().catch(err => {
      log.error('Failed to send Ctrl+C', { sessionId, error: err });
    });
  }, [sendCtrlC, sessionId]);

  const handleClose = useCallback(() => {
    close().catch(err => {
      log.error('Failed to close', { sessionId, error: err });
    });
    onClose?.();
  }, [close, onClose, sessionId]);

  const handleRetry = useCallback(() => {
    refresh().catch(err => {
      log.error('Retry failed', { sessionId, error: err });
    });
  }, [refresh, sessionId]);

  useEffect(() => {
    if (session) {
      setTitle(session.name);
      if (session.status === 'Exited' || session.status === 'Error') {
        isExitedRef.current = true;
        setIsExited(true);
        inputQueueRef.current?.clear();
      }
    }
  }, [session]);

  const terminalId = `terminal-${sessionId}`;

  useEffect(() => {
    registerTerminalActions(terminalId, {
      getTerminal: () => terminalRef.current?.getTerminal() || null,
      isReadOnly: isExited,
      write: async (data: string) => {
        if (!isExitedRef.current) {
          inputQueueRef.current?.enqueue(data);
        }
      },
      clear: () => {
        terminalRef.current?.clear();
      },
    });

    return () => {
      unregisterTerminalActions(terminalId);
    };
  }, [terminalId, isExited, write]);

  if (isLoading) {
    return (
      <div className={`void-terminal ${className}`}>
        <div className="void-terminal__loading">
          <div className="void-terminal__loading-spinner" />
          <span className="void-terminal__loading-text">Connecting to terminal...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`void-terminal ${className}`}>
        <div className="void-terminal__error">
          <AlertCircle className="void-terminal__error-icon" size={32} />
          <span className="void-terminal__error-message">{error}</span>
          <button 
            className="void-terminal__error-retry"
            onClick={handleRetry}
          >
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`void-terminal ${className}`}>
      {showToolbar && (
        <div className="void-terminal__toolbar">
          <div className="void-terminal__toolbar-left">
            <TerminalIcon size={14} />
            <span className="void-terminal__toolbar-title">
              {title}
              {session && (
                <span className="shell-type">({session.shellType})</span>
              )}
            </span>
          </div>
          <div className="void-terminal__toolbar-right">
            <button
              className="void-terminal__toolbar-btn"
              onClick={handleSendCtrlC}
              title="Send Ctrl+C"
            >
              <span style={{ fontSize: 10, fontWeight: 'bold' }}>^C</span>
            </button>
            <button
              className="void-terminal__toolbar-btn void-terminal__toolbar-btn--danger"
              onClick={handleClose}
              title="Close terminal"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      <Terminal
        ref={terminalRef}
        terminalId={terminalId}
        sessionId={sessionId}
        autoFocus={autoFocus}
        onData={handleData}
        onResize={handleResize}
        onTitleChange={handleTitleChange}
        onReady={handleTerminalReady}
        onPasteShortcut={handlePasteShortcut}
        onPaste={handlePaste}
        preventShrinkBelowColsRef={preventShrinkBelowColsRef}
      />

      {showStatusBar && session && (
        <div className={`void-terminal__statusbar ${
          isExited ? 'void-terminal__statusbar--exited' : ''
        } ${
          error ? 'void-terminal__statusbar--error' : ''
        }`}>
          <div className="void-terminal__statusbar-left">
            <span className="void-terminal__statusbar-item">
              {session.shellType}
            </span>
            <span className="void-terminal__statusbar-item">
              PID: {session.pid || '-'}
            </span>
            <span className="void-terminal__statusbar-item">
              {session.cwd}
            </span>
          </div>
          <div className="void-terminal__statusbar-right">
            <span className="void-terminal__statusbar-item">
              {session.cols}×{session.rows}
            </span>
            {isExited && exitCode !== null && (
              <span className="void-terminal__statusbar-item">
                Exit code: {exitCode}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

ConnectedTerminal.displayName = 'ConnectedTerminal';

export default ConnectedTerminal;
