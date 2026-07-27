import React from 'react';

import type { ChatInputProps } from './ChatInput';

const ChatInput = React.lazy(async () => {
  const module = await import('./ChatInput');
  return { default: module.ChatInput };
});

export const LazyChatInput: React.FC<ChatInputProps> = props => (
  <React.Suspense fallback={null}>
    <ChatInput {...props} />
  </React.Suspense>
);
