interface ChatInputImageStripVisibility {
  imageCount: number;
  isInputActive: boolean;
}

export function shouldShowChatInputImageStrip({
  imageCount,
  isInputActive,
}: ChatInputImageStripVisibility): boolean {
  return isInputActive && imageCount > 0;
}
