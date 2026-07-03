export interface TerminalImeInputSafetyNet {
  handleKeyEvent: (event: Pick<KeyboardEvent, 'type' | 'keyCode'>) => {
    bypassXtermKeyHandling: boolean;
  };
  handleTextareaKeyPress: () => void;
  getInsertedTextFromInputEvent: (event: Pick<InputEvent, 'data' | 'inputType' | 'composed'>) => string | null;
}

/**
 * Bridges the xterm.js keyCode 229 gap seen when an IME is active but typing
 * passthrough ASCII text. xterm can skip composed input events while a keydown
 * is in progress, so the terminal component forwards those insertText events
 * explicitly through onData.
 */
export function createTerminalImeInputSafetyNet(): TerminalImeInputSafetyNet {
  let keyDownSeen = false;
  let keyPressHandled = false;
  let bypassedImeKeyDown = false;

  return {
    handleKeyEvent(event) {
      if (event.type === 'keydown') {
        keyDownSeen = true;
        bypassedImeKeyDown = event.keyCode === 229;
      } else if (event.type === 'keyup') {
        keyDownSeen = false;
        keyPressHandled = false;
        bypassedImeKeyDown = false;
      }

      return {
        bypassXtermKeyHandling: bypassedImeKeyDown,
      };
    },

    handleTextareaKeyPress() {
      keyPressHandled = true;
    },

    getInsertedTextFromInputEvent(event) {
      if (
        event.data &&
        event.inputType === 'insertText' &&
        event.composed === true &&
        keyDownSeen &&
        bypassedImeKeyDown &&
        !keyPressHandled
      ) {
        return event.data;
      }

      return null;
    },
  };
}
