import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import {
  TOOLBAR_MODE_ACTIVATING_EVENT,
  TOOLBAR_MODE_ACTIVATION_FAILED_EVENT,
} from '@/shared/constants/toolbarModeEvents';
import { createLogger } from '@/shared/utils/logger';
import {
  TOOLBAR_COMPACT_MIN,
  TOOLBAR_COMPACT_SIZE,
  TOOLBAR_EXPANDED_MIN,
  TOOLBAR_EXPANDED_SIZE,
  ToolbarModeContext,
  type SavedWindowState,
  type ToolbarModeContextType,
  type ToolbarModeState,
} from './ToolbarModeContext';

const log = createLogger('ToolbarModeContext');

interface ToolbarModeProviderProps {
  children: ReactNode;
}

export const ToolbarModeProvider: React.FC<ToolbarModeProviderProps> = ({ children }) => {
  const [isToolbarMode, setIsToolbarMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [toolbarState, setToolbarState] = useState<ToolbarModeState>({
    sessionId: null,
    sessionTitle: null,
    isProcessing: false,
    latestContent: '',
    latestToolName: null,
    hasPendingConfirmation: false,
    pendingToolId: null,
    hasError: false,
    todoProgress: null,
  });

  const savedWindowStateRef = useRef<SavedWindowState | null>(null);
  const transitionPromiseRef = useRef<Promise<void> | null>(null);

  const startToolbarTransition = useCallback((operation: () => Promise<void>): Promise<void> => {
    if (transitionPromiseRef.current) {
      return transitionPromiseRef.current;
    }

    const transition = operation().finally(() => {
      if (transitionPromiseRef.current === transition) {
        transitionPromiseRef.current = null;
      }
    });
    transitionPromiseRef.current = transition;
    return transition;
  }, []);

  const enableToolbarMode = useCallback(() => startToolbarTransition(async () => {
    try {
      window.dispatchEvent(new CustomEvent(TOOLBAR_MODE_ACTIVATING_EVENT));

      const win = getCurrentWindow();
      const isMacOS =
        typeof window !== 'undefined' &&
        '__TAURI__' in window &&
        typeof navigator !== 'undefined' &&
        typeof navigator.platform === 'string' &&
        navigator.platform.toUpperCase().includes('MAC');

      const [position, size, isMaximized, isDecorated] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        win.isMaximized(),
        (async () => {
          try {
            if (typeof (win as any).isDecorated === 'function') {
              return await (win as any).isDecorated();
            }
          } catch {
          }
          return undefined;
        })(),
      ]);

      savedWindowStateRef.current = {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        isMaximized,
        isDecorated,
      };

      if (isMaximized) {
        await win.unmaximize();
      }

      let x = 100;
      let y = 100;

      const monitor = await currentMonitor();
      if (monitor) {
        const scaleFactor = await win.scaleFactor();
        const margin = Math.round(20 * scaleFactor);
        const taskbarHeight = Math.round(50 * scaleFactor);

        x = monitor.size.width - TOOLBAR_EXPANDED_SIZE.width - margin;
        y = monitor.size.height - TOOLBAR_EXPANDED_SIZE.height - margin - taskbarHeight;
      }

      const toolbarWindowOps: Array<Promise<unknown>> = [
        win.setAlwaysOnTop(true),
        win.setSize(new PhysicalSize(TOOLBAR_EXPANDED_SIZE.width, TOOLBAR_EXPANDED_SIZE.height)),
        win.setPosition(new PhysicalPosition(x, y)),
        win.setResizable(true),
        win.setSkipTaskbar(true),
      ];
      if (!isMacOS) {
        toolbarWindowOps.push(win.setDecorations(false));
      } else {
        try {
          await win.setTitleBarStyle('overlay');
        } catch {
        }
      }
      const toolbarWindowResults = await Promise.allSettled(toolbarWindowOps);
      for (const result of toolbarWindowResults) {
        if (result.status === 'rejected') {
          throw result.reason;
        }
      }

      await win.setMinSize(new PhysicalSize(TOOLBAR_EXPANDED_MIN.width, TOOLBAR_EXPANDED_MIN.height));
      setIsToolbarMode(true);
      setIsExpanded(true);
    } catch (error) {
      log.error('Failed to enable toolbar mode', error);
      setIsToolbarMode(false);
      window.dispatchEvent(new CustomEvent(TOOLBAR_MODE_ACTIVATION_FAILED_EVENT));
    }
  }), [startToolbarTransition]);

  const disableToolbarMode = useCallback(() => startToolbarTransition(async () => {
    try {
      const win = getCurrentWindow();
      const isMacOS =
        typeof window !== 'undefined' &&
        '__TAURI__' in window &&
        typeof navigator !== 'undefined' &&
        typeof navigator.platform === 'string' &&
        navigator.platform.toUpperCase().includes('MAC');
      const saved = savedWindowStateRef.current;

      await win.setMinSize(null);

      if (isMacOS) {
        try {
          await win.setTitleBarStyle('overlay');
        } catch (error) {
          log.debug('Failed to restore macOS overlay title bar (early, ignored)', error);
        }
      } else {
        try {
          const targetDecorations = saved?.isDecorated ?? false;
          await win.setDecorations(targetDecorations);
        } catch (error) {
          log.debug('Failed to restore window decorations (ignored)', error);
        }
      }

      const restoreWindowResults = await Promise.allSettled([
        win.setAlwaysOnTop(false),
        win.setResizable(true),
        win.setSkipTaskbar(false),
      ]);
      for (const result of restoreWindowResults) {
        if (result.status === 'rejected') {
          throw result.reason;
        }
      }

      if (saved) {
        await win.setSize(new PhysicalSize(saved.width, saved.height));
        await win.setPosition(new PhysicalPosition(saved.x, saved.y));

        if (saved.isMaximized) {
          await win.maximize();
        }
      } else {
        await win.setSize(new PhysicalSize(1200, 800));
        await win.center();
      }

      if (isMacOS) {
        try {
          await win.setTitleBarStyle('overlay');
          await new Promise<void>((resolve) => setTimeout(resolve, 60));
          await win.setTitleBarStyle('overlay');
        } catch (error) {
          log.debug('Failed to re-apply macOS overlay title bar (ignored)', error);
        }
      }

      await win.setFocus();
    } catch (error) {
      log.error('Failed to disable toolbar mode', error);
    } finally {
      setIsToolbarMode(false);
      setIsExpanded(false);
    }
  }), [startToolbarTransition]);

  const toggleToolbarMode = useCallback(async () => {
    if (isToolbarMode) {
      await disableToolbarMode();
    } else {
      await enableToolbarMode();
    }
  }, [disableToolbarMode, enableToolbarMode, isToolbarMode]);

  const toggleExpanded = useCallback(async () => {
    if (!isToolbarMode) return;

    const newIsExpanded = !isExpanded;

    try {
      const win = getCurrentWindow();
      const targetSize = newIsExpanded ? TOOLBAR_EXPANDED_SIZE : TOOLBAR_COMPACT_SIZE;
      const minSize = newIsExpanded ? TOOLBAR_EXPANDED_MIN : TOOLBAR_COMPACT_MIN;
      const currentPosition = await win.outerPosition();
      const currentSize = await win.outerSize();
      const heightDiff = targetSize.height - currentSize.height;
      const newY = currentPosition.y - heightDiff;

      setIsExpanded(newIsExpanded);

      await win.setMinSize(new PhysicalSize(minSize.width, minSize.height));
      await win.setSize(new PhysicalSize(targetSize.width, targetSize.height));
      await win.setPosition(new PhysicalPosition(currentPosition.x, Math.max(0, newY)));
    } catch (error) {
      log.error('Failed to toggle expanded state', { newIsExpanded, error });
    }
  }, [isExpanded, isToolbarMode]);

  const setPinned = useCallback((pinned: boolean) => {
    setIsPinned(pinned);
  }, []);

  const togglePinned = useCallback(() => {
    setIsPinned((prev) => !prev);
  }, []);

  const updateToolbarState = useCallback((updates: Partial<ToolbarModeState>) => {
    setToolbarState((prev) => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    return () => {
      // No background timers to clean up here; window state is restored by user actions.
    };
  }, []);

  const value: ToolbarModeContextType = useMemo(() => ({
    isToolbarMode,
    isExpanded,
    isPinned,
    enableToolbarMode,
    disableToolbarMode,
    toggleToolbarMode,
    toggleExpanded,
    setPinned,
    togglePinned,
    toolbarState,
    updateToolbarState,
  }), [
    isToolbarMode,
    isExpanded,
    isPinned,
    enableToolbarMode,
    disableToolbarMode,
    toggleToolbarMode,
    toggleExpanded,
    setPinned,
    togglePinned,
    toolbarState,
    updateToolbarState,
  ]);

  return <ToolbarModeContext.Provider value={value}>{children}</ToolbarModeContext.Provider>;
};
