import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  BookOpenText,
  Bug,
  CalendarCheck,
  ChartNoAxesCombined,
  Clapperboard,
  CodeXml,
  FileCheck2,
  FileImage,
  FileText,
  Gauge,
  ImagePlus,
  ListChecks,
  Mail,
  Presentation,
  RefreshCw,
  ScanSearch,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import type { SessionMode } from '@/app/stores/sessionModeStore';

import './SessionModeExampleCards.scss';

interface SessionModeExample {
  id: string;
  icon: LucideIcon;
}

const VISIBLE_EXAMPLE_COUNT = 3;

const EXAMPLES_BY_MODE: Record<SessionMode, readonly SessionModeExample[]> = {
  code: [
    { id: 'explain_code', icon: BookOpenText },
    { id: 'fix_bug', icon: Bug },
    { id: 'build_feature', icon: CodeXml },
    { id: 'review_changes', icon: FileCheck2 },
    { id: 'improve_performance', icon: Gauge },
    { id: 'inspect_project', icon: ScanSearch },
  ],
  cowork: [
    { id: 'organize_tasks', icon: ListChecks },
    { id: 'summarize_documents', icon: FileText },
    { id: 'prepare_presentation', icon: Presentation },
    { id: 'analyze_data', icon: ChartNoAxesCombined },
    { id: 'plan_week', icon: CalendarCheck },
    { id: 'draft_email', icon: Mail },
  ],
  media: [
    { id: 'create_storyboard', icon: Clapperboard },
    { id: 'design_character', icon: Sparkles },
    { id: 'generate_keyframe', icon: ImagePlus },
    { id: 'review_assets', icon: FileImage },
    { id: 'plan_shots', icon: ListChecks },
    { id: 'polish_prompt', icon: FileText },
  ],
};

function selectExamplePage(
  examples: readonly SessionModeExample[],
  page: number,
): SessionModeExample[] {
  const start = (page * VISIBLE_EXAMPLE_COUNT) % examples.length;
  return Array.from({ length: VISIBLE_EXAMPLE_COUNT }, (_, index) => (
    examples[(start + index) % examples.length]
  ));
}

export interface SessionModeExampleCardsProps {
  mode: SessionMode;
  resetKey?: number;
  onSelectPrompt: (prompt: string) => void;
}

export const SessionModeExampleCards: React.FC<SessionModeExampleCardsProps> = ({
  mode,
  resetKey = 0,
  onSelectPrompt,
}) => {
  const { t } = useTranslation('flow-chat');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [mode, resetKey]);

  const examples = useMemo(
    () => selectExamplePage(EXAMPLES_BY_MODE[mode], page),
    [mode, page],
  );

  const handleRefresh = useCallback(() => {
    setPage(current => current + 1);
  }, []);

  return (
    <section
      className="void-session-example-cards"
      aria-label={t('newSessionExamples.label')}
    >
      <div className="void-session-example-cards__header">
        <span className="void-session-example-cards__title">
          {t(`newSessionExamples.modeHint.${mode}`)}
        </span>
        <button
          type="button"
          className="void-session-example-cards__refresh"
          onClick={handleRefresh}
          aria-label={t('newSessionExamples.refresh')}
          title={t('newSessionExamples.refresh')}
        >
          <RefreshCw size={14} strokeWidth={1.6} aria-hidden />
        </button>
      </div>
      <div className="void-session-example-cards__grid">
        {examples.map(({ id, icon: Icon }) => {
          const title = t(`newSessionExamples.items.${mode}.${id}.title`);
          const prompt = t(`newSessionExamples.items.${mode}.${id}.prompt`);
          return (
            <button
              key={`${mode}:${id}`}
              type="button"
              className="void-session-example-cards__option"
              onClick={() => onSelectPrompt(prompt)}
              title={title}
            >
              <Icon
                className="void-session-example-cards__option-icon"
                size={15}
                strokeWidth={1.6}
                aria-hidden
              />
              <span>{title}</span>
              <ArrowUpRight
                className="void-session-example-cards__option-arrow"
                size={13}
                strokeWidth={1.5}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default SessionModeExampleCards;
