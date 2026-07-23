import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
} from 'lucide-react';
import { IconButton, MarkdownRenderer, ToolProcessingDots, Tooltip } from '@/component-library';
import type { SessionUsageReport } from '@/infrastructure/api/service-api/SessionAPI';
import {
  buildSessionUsageExportMarkdown,
  formatHitRateSuffix,
  formatUsageDuration,
  formatUsageNumber,
  formatUsageTimestamp,
  getCoverageLabel,
  getCoverageTone,
  getFileScopeHelp,
  getFileSummaryLabel,
  getUsageDisplayPathLabel,
  getUsageExportRedactPathsPreference,
  setUsageExportRedactPathsPreference,
  subscribeUsageExportRedactPathsPreference,
} from './usageReportUtils';
import './SessionUsageReportCard.scss';

interface SessionUsageReportCardProps {
  report?: SessionUsageReport;
  markdown?: string;
  generatedAt?: number;
  isLoading?: boolean;
  contextUsage?: { current: number; max: number };
}

export const SessionUsageReportCard: React.FC<SessionUsageReportCardProps> = ({
  report,
  markdown = '',
  generatedAt,
  isLoading = false,
  contextUsage,
}) => {
  const { t } = useTranslation('flow-chat');
  const [copied, setCopied] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [redactExportPaths, setRedactExportPaths] = useState(getUsageExportRedactPathsPreference);

  const handleCopy = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(buildSessionUsageExportMarkdown(markdown, report, {
        redactPaths: redactExportPaths,
        t,
      }));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [markdown, redactExportPaths, report, t]);

  const handleRedactExportPathsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setUsageExportRedactPathsPreference(event.target.checked);
  }, []);

  const loadingHints = useMemo(() => [
    t('usage.loading.steps.collecting'),
    t('usage.loading.steps.tokens'),
    t('usage.loading.steps.safety'),
  ], [t]);

  useEffect(() => {
    if (!isLoading || loadingHints.length <= 1) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setLoadingStep(step => (step + 1) % loadingHints.length);
    }, 1600);

    return () => window.clearInterval(timer);
  }, [isLoading, loadingHints.length]);

  useEffect(() => (
    subscribeUsageExportRedactPathsPreference(setRedactExportPaths)
  ), []);

  if (isLoading) {
    return (
      <div className="session-usage-report-card session-usage-report-card--loading" aria-live="polite">
        <div className="session-usage-report-card__loading-main">
          <ToolProcessingDots className="session-usage-report-card__loading-dots" size={12} />
          <div>
            <h3 className="session-usage-report-card__loading-title">{t('usage.loading.title')}</h3>
            <p className="session-usage-report-card__loading-description">{t('usage.loading.description')}</p>
          </div>
        </div>
        <div className="session-usage-report-card__loading-step">
          {loadingHints[loadingStep] ?? loadingHints[0]}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="session-usage-report-card session-usage-report-card--fallback">
        <div className="session-usage-report-card__fallback-actions">
          <Tooltip content={copied ? t('usage.actions.copied') : t('usage.actions.copyMarkdown')}>
            <IconButton
              variant="ghost"
              size="xs"
              onClick={handleCopy}
              aria-label={copied ? t('usage.actions.copied') : t('usage.actions.copyMarkdown')}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </IconButton>
          </Tooltip>
        </div>
        <MarkdownRenderer content={markdown} />
      </div>
    );
  }

  const coverageTone = getCoverageTone(report.coverage.level);
  const tokenTotal = report.tokens.totalTokens;
  const cachedTokenText = report.tokens.cacheCoverage === 'unavailable'
    ? t('usage.status.cacheNotReported')
    : `${formatUsageNumber(report.tokens.cachedTokens, t)}${formatHitRateSuffix(report.tokens.cacheHitRate, t)}`;
  const cachedTokenHelp = report.tokens.cacheCoverage === 'unavailable'
    ? t('usage.help.cachedTokens')
    : report.tokens.cacheCoverage === 'partial'
      ? t('usage.help.cachedTokensPartial')
    : undefined;
  const fileMetricHelp = getFileScopeHelp(report, t);
  const contextShare = contextUsage && contextUsage.max > 0 && contextUsage.current >= 0
    ? Math.min(100, Math.round((contextUsage.current / contextUsage.max) * 100))
    : undefined;
  const workspacePathLabel = getUsageDisplayPathLabel(report.workspace.pathLabel, t, {
    redactPaths: redactExportPaths,
  });

  const metrics = [
    ...(contextShare !== undefined ? [{
      key: 'context',
      label: t('usage.panel.contextUsage'),
      value: t('usage.percent', { value: contextShare }),
    }] : []),
    {
      key: 'wall',
      label: t('usage.metrics.wall'),
      value: formatUsageDuration(report.time.wallTimeMs, t),
      help: t('usage.help.wall'),
    },
    {
      key: 'tokens',
      label: t('usage.metrics.tokens'),
      value: formatUsageNumber(tokenTotal, t),
    },
    {
      key: 'cached',
      label: t('usage.metrics.cached'),
      value: cachedTokenText,
      help: cachedTokenHelp,
    },
    {
      key: 'files',
      label: t('usage.metrics.files'),
      value: getFileSummaryLabel(report, t),
      help: fileMetricHelp,
    },
    {
      key: 'errors',
      label: t('usage.metrics.errors'),
      value: formatUsageNumber(report.errors.totalErrors, t),
      tone: report.errors.totalErrors > 0 ? 'warning' : undefined,
      help: t('usage.help.errors'),
    },
  ];
  const inputTokens = report.tokens.inputTokens ?? 0;
  const outputTokens = report.tokens.outputTokens ?? 0;
  const cachedTokens = report.tokens.cachedTokens ?? 0;
  const tokenFlowTotal = Math.max(1, inputTokens + outputTokens);
  const inputShare = Math.round((inputTokens / tokenFlowTotal) * 100);
  const outputShare = 100 - inputShare;
  const cacheShare = report.tokens.cacheCoverage === 'unavailable' || inputTokens <= 0
    ? undefined
    : Math.min(100, Math.round((cachedTokens / inputTokens) * 100));
  const timeSegments = [
    {
      key: 'model',
      label: t('usage.visuals.model'),
      value: report.time.modelMs,
    },
    {
      key: 'tool',
      label: t('usage.visuals.tool'),
      value: report.time.toolMs,
    },
    {
      key: 'active',
      label: t('usage.visuals.active'),
      value: report.time.activeTurnMs,
    },
  ];
  const maxTimeSegment = Math.max(1, ...timeSegments.map(segment => segment.value ?? 0));

  const coverageBadgeClassName =
    `session-usage-report-card__coverage session-usage-report-card__coverage--${coverageTone}` +
    (report.coverage.level !== 'complete' ? ' session-usage-report-card__coverage--hint' : '');

  return (
    <div className="session-usage-report-card" data-report-id={report.reportId}>
      <div className="session-usage-report-card__header">
        <div className="session-usage-report-card__title-block">
          <h3 className="session-usage-report-card__title">{t('usage.card.heading')}</h3>
          <div className="session-usage-report-card__meta">
            <span>{formatUsageTimestamp(generatedAt ?? report.generatedAt, t)}</span>
            <span>{t('usage.card.turns', { count: report.scope.turnCount })}</span>
            <span>{workspacePathLabel}</span>
          </div>
        </div>
        <div className="session-usage-report-card__actions">
          {report.coverage.level !== 'complete' ? (
            <Tooltip content={t('usage.coverage.partialNotice')} placement="top">
              <span className={coverageBadgeClassName}>
                {getCoverageLabel(report.coverage.level, t)}
              </span>
            </Tooltip>
          ) : (
            <span className={coverageBadgeClassName}>
              {getCoverageLabel(report.coverage.level, t)}
            </span>
          )}
          <div className="session-usage-report-card__header-actions">
            <Tooltip content={t('usage.export.redactPathsHelp')}>
              <label className="session-usage-report-card__export-option">
                <input
                  type="checkbox"
                  checked={redactExportPaths}
                  onChange={handleRedactExportPathsChange}
                  aria-label={t('usage.export.redactPaths')}
                />
                <span>{t('usage.export.redactPaths')}</span>
              </label>
            </Tooltip>
            <Tooltip content={copied ? t('usage.actions.copied') : t('usage.actions.copyMarkdown')}>
              <IconButton
                className="session-usage-report-card__copy-action"
                variant="ghost"
                size="xs"
                onClick={handleCopy}
                aria-label={copied ? t('usage.actions.copied') : t('usage.actions.copyMarkdown')}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="session-usage-report-card__main">
        <div className={`session-usage-report-card__metrics${contextShare !== undefined ? ' session-usage-report-card__metrics--with-context' : ''}`}>
          {metrics.map(metric => (
            <div
              className={`session-usage-report-card__metric${metric.tone ? ` session-usage-report-card__metric--${metric.tone}` : ''}`}
              key={metric.key}
            >
              <UsageMetricValue value={metric.value} help={metric.help} />
              <span className="session-usage-report-card__metric-label">{metric.label}</span>
            </div>
          ))}
        </div>
        <div className="session-usage-report-card__visuals">
          <div className="session-usage-report-card__visual">
            <div className="session-usage-report-card__visual-heading">
              <span>{t('usage.visuals.tokenFlow')}</span>
              <span>{inputShare}% / {outputShare}%</span>
            </div>
            <div
              className="session-usage-report-card__token-flow"
              role="img"
              aria-label={t('usage.visuals.tokenFlowAriaLabel')}
            >
              <span
                className="session-usage-report-card__token-flow-input"
                style={{ width: `${inputShare}%` }}
              />
              <span
                className="session-usage-report-card__token-flow-output"
                style={{ width: `${outputShare}%` }}
              />
            </div>
            <div className="session-usage-report-card__legend">
              <span><i className="session-usage-report-card__legend-dot session-usage-report-card__legend-dot--input" />{t('usage.table.input')}</span>
              <span><i className="session-usage-report-card__legend-dot session-usage-report-card__legend-dot--output" />{t('usage.table.output')}</span>
              {cacheShare !== undefined && <span>{t('usage.visuals.cacheShare', { value: cacheShare })}</span>}
            </div>
          </div>
          <div className="session-usage-report-card__visual">
            <div className="session-usage-report-card__visual-heading">
              <span>{t('usage.visuals.timeProfile')}</span>
            </div>
            <div className="session-usage-report-card__time-profile">
              {timeSegments.map(segment => {
                const value = segment.value ?? 0;
                const width = value > 0 ? Math.max(4, Math.round((value / maxTimeSegment) * 100)) : 0;
                return (
                  <div className="session-usage-report-card__time-row" key={segment.key}>
                    <span>{segment.label}</span>
                    <div className="session-usage-report-card__time-track" aria-hidden="true">
                      <i style={{ width: `${width}%` }} />
                    </div>
                    <strong>{formatUsageDuration(value, t)}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function UsageMetricValue({ value, help }: { value: string; help?: string }) {
  const node = (
    <span className={`session-usage-report-card__metric-value${help ? ' session-usage-report-card__metric-value--help' : ''}`}>
      {value}
    </span>
  );

  return help ? <Tooltip content={help}>{node}</Tooltip> : node;
}

SessionUsageReportCard.displayName = 'SessionUsageReportCard';
