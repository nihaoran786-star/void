import React from 'react';
import type { ToolCardConfig } from '../types/flow-chat';
import { MediaGenerationToolCard } from './MediaGenerationToolCard';
import type { MediaToolGroup } from './mediaToolGrouping';

interface MediaGenerationToolGroupCardProps {
  group: MediaToolGroup;
  sessionId?: string;
}

function displayNameForTool(toolName: string): string {
  if (toolName === 'GenerateVideo') return 'Generate Video';
  if (toolName === 'GenerateSpeech') return 'Generate Speech';
  if (toolName === 'TranscribeAudio') return 'Transcribe Audio';
  if (toolName === 'UploadMediaImage') return 'Upload Media';
  return 'Generate Image';
}

function configForGroup(group: MediaToolGroup): ToolCardConfig {
  return {
    toolName: group.toolName,
    displayName: displayNameForTool(group.toolName),
    icon: group.kind === 'video' ? 'VID' : group.kind === 'audio' ? 'AUD' : group.kind === 'upload' ? 'UP' : 'IMG',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    displayMode: 'detailed',
  };
}

export const MediaGenerationToolGroupCard: React.FC<MediaGenerationToolGroupCardProps> = ({ group, sessionId }) => {
  return (
    <MediaGenerationToolCard
      toolItem={group.syntheticToolItem}
      config={configForGroup(group)}
      sessionId={sessionId}
    />
  );
};
