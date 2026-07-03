/**
 * Terminal utilities.
 */

export { TerminalResizeDebouncer } from './TerminalResizeDebouncer';
export type { ResizeCallback, ResizeDebounceOptions } from './TerminalResizeDebouncer';
export { TerminalInputQueue } from './TerminalInputQueue';
export {
  POWERSHELL_READLINE_PASTE_SEQUENCE,
  analyzeTerminalPaste,
  buildTerminalPastePreview,
  resolveTerminalPaste,
  shouldUsePowerShellReadlinePaste,
} from './terminalPaste';
export type {
  TerminalPasteAnalysis,
  TerminalPasteConfirmationRequest,
  TerminalPasteConfirmationResult,
  TerminalPasteDecision,
  TerminalPasteOptions,
  TerminalPasteWarningMode,
} from './terminalPaste';
export {
  createResizeRepaintGuard,
  isStandaloneCursorPosition,
} from './resizeRepaintGuard';
export type {
  ResizeRepaintGuard,
  ResizeRepaintGuardOptions,
} from './resizeRepaintGuard';
export { normalizeTerminalReplay } from './terminalReplay';
export { createReplayAwareTerminalEventHandler } from './terminalReplayEventQueue';
export {
  buildXtermTheme,
  getXtermAnsiPalette,
  getXtermFontWeights,
  DEFAULT_XTERM_MINIMUM_CONTRAST_RATIO,
} from './xtermTheme';

