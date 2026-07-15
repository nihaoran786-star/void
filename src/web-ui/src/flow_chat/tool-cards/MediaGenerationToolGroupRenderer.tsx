import React from 'react';
import { FlowToolCardErrorBoundary } from '../components/FlowToolCardErrorBoundary';
import type { MediaToolGroup } from './mediaToolGrouping';
import { getToolCardConfig } from './toolCardMetadata';

interface MediaGenerationToolGroupCardProps {
  group: MediaToolGroup;
  sessionId?: string;
}

const MediaGenerationToolGroupCard = React.lazy(() =>
  import('./MediaGenerationToolGroupCard').then(module => ({
    default: module.MediaGenerationToolGroupCard,
  })),
);

export const MediaGenerationToolGroupRenderer: React.FC<MediaGenerationToolGroupCardProps> = ({
  group,
  sessionId,
}) => {
  const displayName = getToolCardConfig(group.toolName).displayName;

  return (
    <div className="flowchat-flow-item" data-flow-item-id={group.id} data-flow-item-type="tool">
      <FlowToolCardErrorBoundary
        toolItem={group.syntheticToolItem}
        displayName={displayName}
        sessionId={sessionId}
      >
        <React.Suspense
          fallback={<div className="flow-tool-card-wrapper" aria-busy="true" style={{ minHeight: 36 }} />}
        >
          <MediaGenerationToolGroupCard group={group} sessionId={sessionId} />
        </React.Suspense>
      </FlowToolCardErrorBoundary>
    </div>
  );
};
