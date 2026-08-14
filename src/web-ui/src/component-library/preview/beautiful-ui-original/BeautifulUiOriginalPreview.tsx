import React from 'react';
import LoadingState from './components/loading-state';
import ThinkingState from './components/thinking-state';
import StreamingText from './components/streaming-text';
import ApprovalCard from './components/approval-card';
import ToolChips from './components/tool-chips';
import TaskRows from './components/task-rows';
import ChatComposer from './components/chat-composer';
import PromptBar from './components/prompt-bar';
import RecommendationCard from './components/recommendation-card';
import ContextCards from './components/context-cards';
import DiffTable from './components/diff-table';
import RecordsTable from './components/records-table';
import FilterTable from './components/filter-table';
import SidebarNav from './components/sidebar-nav';
import SearchList from './components/search';
import InsightCards from './components/insight-cards';
import CodeBlock from './components/code-block';
import FineTuneCard from './components/fine-tune-card';
import SelectionActions from './components/selection-actions';
import { BeautifulUIStage } from '@/component-library/components/BeautifulUI';

interface BeautifulUiOriginalPreviewProps {
  componentId: string;
  cycle?: number;
}

type OriginalComponent = React.ComponentType<{ variant?: string }>;

const components: Record<string, OriginalComponent> = {
  'loading-state': LoadingState,
  'thinking-state': ThinkingState,
  'streaming-text': StreamingText,
  'approval-card': ApprovalCard,
  'tool-chips': ToolChips,
  'task-rows': TaskRows,
  'chat-composer': ChatComposer,
  'prompt-bar': PromptBar,
  'recommendation-card': RecommendationCard,
  'context-cards': ContextCards,
  'diff-table': DiffTable,
  'records-table': RecordsTable,
  'filter-table': FilterTable,
  'sidebar-nav': SidebarNav,
  search: SearchList,
  'insight-cards': InsightCards,
  'code-block': CodeBlock,
  'fine-tune-card': FineTuneCard,
  'selection-actions': SelectionActions,
};

const componentVariants: Record<string, string[]> = {
  'loading-state': ['Drive', 'Dots', 'Orbit'],
  'thinking-state': ['Steps', 'Reasoning', 'Search', 'Coding'],
  'task-rows': ['Capsules', 'List'],
  'prompt-bar': ['Rounded', 'Pill'],
};

export const BeautifulUiOriginalPreview: React.FC<BeautifulUiOriginalPreviewProps> = ({
  componentId,
  cycle = 0,
}) => {
  const Component = components[componentId];
  const variants = componentVariants[componentId];
  const [variant, setVariant] = React.useState(variants?.[0]);
  if (!Component) return null;

  return (
    <BeautifulUIStage mode="preview" theme="dark">
      <div
        data-beautiful-component={componentId}
        className="beautiful-ui-original-root"
      >
        <Component key={cycle} variant={variant} />
        {variants && (
          <div
            className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 rounded-full bg-field p-0.5"
            role="group"
            aria-label={`${componentId} variants`}
          >
            {variants.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={variant === item}
                onClick={() => setVariant(item)}
                className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium transition-[background-color,color,box-shadow] duration-150
                  ${variant === item ? 'bg-surface text-ink shadow-btn' : 'text-ink-3 hover:text-ink-2'}`}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </BeautifulUIStage>
  );
};
