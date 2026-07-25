import { Loader2, Mic, Square } from 'lucide-react';
import { IconButton } from '@/component-library';
import type { ComposerVoiceInputController } from './useComposerVoiceInput';

interface ComposerVoiceInputButtonProps {
  controller: ComposerVoiceInputController;
}

export function ComposerVoiceInputButton({
  controller,
}: ComposerVoiceInputButtonProps) {
  if (!controller.enabled) return null;
  const busy = controller.phase === 'preparing' || controller.phase === 'transcribing';
  return (
    <IconButton
      variant={controller.phase === 'recording' ? 'danger' : 'ghost'}
      size="xs"
      aria-label={controller.tooltip}
      aria-busy={busy}
      disabled={controller.disabled}
      tooltip={controller.tooltip}
      onClick={event => {
        event.stopPropagation();
        controller.toggle();
      }}
    >
      {busy
        ? <Loader2 size={14} aria-hidden />
        : controller.phase === 'recording'
          ? <Square size={12} aria-hidden />
          : <Mic size={14} aria-hidden />}
    </IconButton>
  );
}
