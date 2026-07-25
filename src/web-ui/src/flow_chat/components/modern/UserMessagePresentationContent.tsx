import React from 'react';
import {
  getContextPresentationLabel,
  type ComposerPresentation,
} from '../../utils/composerPresentation';

export interface UserMessagePresentationContentProps {
  presentation: ComposerPresentation;
}

export const UserMessagePresentationContent: React.FC<UserMessagePresentationContentProps> = ({
  presentation,
}) => (
  <>
    {presentation.segments.map((segment, index) => {
      if (segment.type === 'text') {
        return <React.Fragment key={`text-${index}`}>{segment.text}</React.Fragment>;
      }
      if (segment.type === 'skill') {
        return (
          <span
            key={`skill-${index}`}
            className="user-message-item__reference-pill user-message-item__reference-pill--skill"
            aria-label={`Skill reference: ${segment.name}`}
          >
            <span aria-hidden>Skill</span> {segment.name}
          </span>
        );
      }
      const label = getContextPresentationLabel(segment.context);
      const kind = segment.context.type === 'session-reference'
        ? 'Session'
        : segment.context.type === 'media-reference'
          ? segment.context.kind
          : segment.context.type;
      return (
        <span
          key={`${segment.context.id}-${index}`}
          className={`user-message-item__reference-pill user-message-item__reference-pill--${segment.context.type}`}
          aria-label={`${kind} reference: ${label}`}
          title={label}
        >
          <span aria-hidden>{kind}</span> {label}
        </span>
      );
    })}
  </>
);

UserMessagePresentationContent.displayName = 'UserMessagePresentationContent';
