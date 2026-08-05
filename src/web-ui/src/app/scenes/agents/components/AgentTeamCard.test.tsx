import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AgentTeamCard from './AgentTeamCard';
import { resolveEmployeeAvatarUrl } from './employeeAvatar';

function readAgentTeamCardStylesheet(): string {
  const stylesheet = readFileSync(
    fileURLToPath(new URL('./AgentTeamCard.scss', import.meta.url)),
    'utf8',
  );
  return stylesheet.replace(/\r\n/g, '\n');
}

function extractBlock(stylesheet: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\n\\s*\\}`));
  return match?.groups?.body ?? '';
}

describe('AgentTeamCard', () => {
  it('keeps role summary compact when the review team grows', () => {
    const markup = renderToStaticMarkup(
      <AgentTeamCard
        title="Code Review Team"
        subtitle="Reviewers inspect the change from multiple angles."
        roleName="Code review"
        avatarIdentity="team:fixed-team:default-review-team"
        avatarName="Code Review Team"
        tagNames={[
          'Business logic',
          'Performance',
          'Security',
          'Architecture',
          'Frontend',
          'Judge',
        ]}
        onOpen={() => undefined}
      />,
    );

    const chipMatches = markup.match(/agent-team-card__tag-chip/g) ?? [];
    expect(chipMatches).toHaveLength(3);
    expect(markup).toContain('Business logic');
    expect(markup).toContain('Performance');
    expect(markup).toContain('Security');
    expect(markup).not.toContain('Architecture');
    expect(markup).not.toContain('Frontend');
    expect(markup).not.toContain('Judge');
  });

  it('uses the stable team identity to render a reusable employee portrait', () => {
    const avatarIdentity = 'team:fixed-team:default-review-team';
    const markup = renderToStaticMarkup(
      <AgentTeamCard
        title="代码审查团队"
        subtitle="从多个专业角度检查代码变更。"
        roleName="审查主理人"
        avatarIdentity={avatarIdentity}
        avatarName="代码审查团队"
        tagNames={['代码审查']}
        onOpen={() => undefined}
      />,
    );

    expect(markup).toContain(`src="${resolveEmployeeAvatarUrl(avatarIdentity)}"`);
    expect(markup).toContain('agent-team-card__avatar');
  });

  it('renders the optional quick-dispatch action without changing the card entry action', () => {
    const markup = renderToStaticMarkup(
      <AgentTeamCard
        title="软件交付团队"
        subtitle="协作完成软件交付。"
        roleName="交付主理人"
        avatarIdentity="team:custom:delivery"
        avatarName="软件交付团队"
        tagNames={['软件交付']}
        onOpen={() => undefined}
        onDispatch={() => undefined}
        dispatchLabel="派发任务"
      />,
    );
    const source = readFileSync(
      fileURLToPath(new URL('./AgentTeamCard.tsx', import.meta.url)),
      'utf8',
    );

    expect(markup).toContain('agent-team-card__dispatch');
    expect(markup).toContain('派发任务');
    expect(source).toContain('event.stopPropagation();');
    expect(source).toContain('onKeyDown={event => event.stopPropagation()}');
  });

  it('keeps card, lead, and member portrait identities deterministic', () => {
    const cardSource = readFileSync(
      fileURLToPath(new URL('./TeamCatalogCard.tsx', import.meta.url)),
      'utf8',
    );
    const detailSource = readFileSync(
      fileURLToPath(new URL('./TeamCatalogDetail.tsx', import.meta.url)),
      'utf8',
    );

    expect(cardSource).toContain(
      'avatarIdentity={`team:${team.source.adapterId}:${team.identity.id}`}',
    );
    expect(detailSource).toContain(
      'identity={`team:${team.identity.id}:lead:${team.lead.identity.id}`}',
    );
    expect(detailSource).toContain(
      'identity={`team:${team.identity.id}:member:${member.identity.id}`}',
    );
  });

  it('keeps role summary tags shrinkable and wrapping instead of clipping chips', () => {
    const stylesheet = readAgentTeamCardStylesheet();
    const tagsBlock = extractBlock(stylesheet, '&__tags');
    const tagChipBlock = extractBlock(stylesheet, '&__tag-chip');

    expect(tagsBlock).toContain('flex-wrap: wrap;');
    expect(tagsBlock).toContain('min-width: 0;');
    expect(tagsBlock).toContain('max-width: 100%;');
    expect(tagChipBlock).toContain('white-space: nowrap;');
  });
});
