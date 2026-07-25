import React from 'react';
import { AlertCircle, CircleUserRound, ExternalLink, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/component-library/components/Button';
import {
  defaultAuthSessionController,
  useAuthSession,
  type AuthErrorCategory,
  type AuthSessionController,
  type AuthSessionSnapshot,
} from '@/app/auth-session';
import {
  useAccountUsage,
  type AccountUsageClient,
  type AccountUsageState,
  type DailyTokenUsage,
} from '@/app/account-usage';
import { SubscriptionAccountsPanel } from '@/app/subscription-auth';
import { useI18n } from '@/infrastructure/i18n';
import {
  ConfigPageContent,
  ConfigPageHeader,
  ConfigPageLayout,
  ConfigPageRow,
  ConfigPageSection,
} from '@/infrastructure/config/components/common';
import './AccountSettings.scss';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface AccountSettingsViewProps {
  snapshot: AuthSessionSnapshot;
  usageState: AccountUsageState;
  subscriptionAccounts?: React.ReactNode;
  onStartWebAuthorization: () => void;
  onClearError: () => void;
  onSignOut: () => void;
  t: Translate;
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatTokenInHundredMillions(value: number): string {
  if (value <= 0) {
    return '0';
  }
  const hundredMillions = value / 100_000_000;
  if (hundredMillions < 0.0001) {
    return '<0.0001';
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(hundredMillions);
}

function formatUsageDate(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function heatLevel(tokens: number, peak: number): number {
  if (tokens <= 0 || peak <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(4, Math.ceil((tokens / peak) * 4)));
}

function ActivityHeatmap({
  daily,
  peak,
  t,
}: {
  daily: DailyTokenUsage[];
  peak: number;
  t: Translate;
}) {
  const figureRef = React.useRef<HTMLDivElement>(null);
  const weekColumnCount = Math.max(1, Math.ceil(daily.length / 7));
  const heatmapColumns = `repeat(${weekColumnCount}, minmax(0, 1fr))`;
  const monthMarkers = daily.reduce<Array<{ label: string; column: number }>>((markers, day, index) => {
    const date = new Date(`${day.date}T00:00:00Z`);
    const isMonthStart = date.getUTCDate() === 1;
    if (!isMonthStart) {
      return markers;
    }
    const column = Math.floor(index / 7) + 1;
    const previous = markers[markers.length - 1];
    if (previous?.column === column) {
      return markers;
    }
    markers.push({
      label: new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(date),
      column,
    });
    return markers;
  }, []);

  React.useEffect(() => {
    const figure = figureRef.current;
    if (!figure) {
      return;
    }

    const revealLatest = () => {
      figure.scrollLeft = Math.max(0, figure.scrollWidth - figure.clientWidth);
    };

    revealLatest();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(revealLatest);
    observer.observe(figure);
    return () => observer.disconnect();
  }, [daily]);

  const handleHeatmapKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const figure = figureRef.current;
    if (!figure) {
      return;
    }

    const latest = Math.max(0, figure.scrollWidth - figure.clientWidth);
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        figure.scrollLeft = Math.max(0, figure.scrollLeft - 48);
        break;
      case 'ArrowRight':
        event.preventDefault();
        figure.scrollLeft = Math.min(latest, figure.scrollLeft + 48);
        break;
      case 'Home':
        event.preventDefault();
        figure.scrollLeft = 0;
        break;
      case 'End':
        event.preventDefault();
        figure.scrollLeft = latest;
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="account-settings__heatmap-figure"
      ref={figureRef}
      role="region"
      aria-label={t('account.usage.activityAriaLabel')}
      tabIndex={0}
      onKeyDown={handleHeatmapKeyDown}
    >
      <div
        className="account-settings__heatmap"
        style={{ gridTemplateColumns: heatmapColumns }}
        role="img"
        aria-label={t('account.usage.activityAriaLabel')}
      >
        {daily.map(day => (
          <span
            key={day.date}
            className={`account-settings__heat-cell account-settings__heat-cell--${heatLevel(day.totalTokens, peak)}`}
            title={t('account.usage.activityTooltip', {
              date: day.date,
              value: formatTokenInHundredMillions(day.totalTokens),
            })}
            aria-hidden="true"
          />
        ))}
      </div>
      <div
        className="account-settings__heatmap-months"
        style={{ gridTemplateColumns: heatmapColumns }}
        aria-hidden="true"
      >
        {monthMarkers.map(marker => (
          <span
            key={`${marker.label}-${marker.column}`}
            style={{ gridColumnStart: marker.column }}
          >
            {marker.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AccountUsageOverviewView({
  state,
  t,
}: {
  state: AccountUsageState;
  t: Translate;
}) {
  if (state.status === 'loading') {
    return (
      <div className="account-settings__usage-state" aria-live="polite">
        <LoaderCircle className="account-settings__spinner" size={16} />
        {t('account.usage.loading')}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="account-settings__usage-state account-settings__usage-state--error" role="status">
        <AlertCircle size={16} />
        {t(`account.usage.errors.${state.category}`)}
      </div>
    );
  }

  const { overview } = state;
  const firstRecordedDate = formatUsageDate(overview.firstRecordedAt);
  const lastRecordedDate = formatUsageDate(overview.lastRecordedAt);
  const metrics = [
    [formatTokenCount(overview.totalTokens), t('account.usage.metrics.totalTokens')],
    [formatTokenCount(overview.peakDailyTokens), t('account.usage.metrics.peakTokens')],
    [String(overview.activeDays), t('account.usage.metrics.activeDays')],
    [String(overview.currentStreakDays), t('account.usage.metrics.currentStreak')],
    [String(overview.longestStreakDays), t('account.usage.metrics.longestStreak')],
  ];

  return (
    <div className="account-settings__usage" data-usage-status={state.status}>
      <div className="account-settings__provenance">
        <span className="account-settings__source">
          <i aria-hidden="true" />
          {t('account.usage.provenance.device')}
        </span>
        <span>{t('account.usage.provenance.recordCount', { count: overview.recordCount })}</span>
        {firstRecordedDate && lastRecordedDate && (
          <span>{firstRecordedDate} — {lastRecordedDate}</span>
        )}
      </div>
      <div className="account-settings__metric-strip">
        {metrics.map(([value, label]) => (
          <div className="account-settings__usage-metric" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="account-settings__activity">
        <div className="account-settings__activity-heading">
          <strong>{t('account.usage.activityTitle')}</strong>
          <span>{t('account.usage.activityRange')}</span>
        </div>
        <ActivityHeatmap daily={overview.daily} peak={overview.peakDailyTokens} t={t} />
        {state.status === 'empty' && (
          <p className="account-settings__empty-hint">{t('account.usage.empty')}</p>
        )}
      </div>
    </div>
  );
}

function errorKey(category: AuthErrorCategory): string {
  return `account.errors.${category}`;
}

function AccountIdentity({
  snapshot,
  onStartWebAuthorization,
  onClearError,
  onSignOut,
  t,
}: AccountSettingsViewProps) {
  const { state, capabilities } = snapshot;
  const webAuthorizationAvailable = capabilities.webAuthorization === 'available';

  if (state.status === 'authenticated') {
    return (
      <div className="account-settings__identity" data-auth-status="authenticated">
        <div className="account-settings__avatar" aria-hidden="true">
          {state.account.avatarUrl ? (
            <img src={state.account.avatarUrl} alt="" />
          ) : (
            state.account.displayName.slice(0, 1).toLocaleUpperCase()
          )}
        </div>
        <div className="account-settings__identity-copy">
          <div className="account-settings__name-row">
            <strong>{state.account.displayName}</strong>
            <span className="account-settings__status account-settings__status--online">
              {t('account.states.authenticated')}
            </span>
          </div>
          {state.account.email && (
            <span className="account-settings__secondary">{state.account.email}</span>
          )}
        </div>
        <Button variant="secondary" size="small" onClick={onSignOut}>
          {t('account.actions.signOut')}
        </Button>
      </div>
    );
  }

  if (state.status === 'authorizing') {
    return (
      <div className="account-settings__identity" data-auth-status="authorizing" aria-live="polite">
        <div className="account-settings__avatar account-settings__avatar--muted" aria-hidden="true">
          <LoaderCircle className="account-settings__spinner" size={18} />
        </div>
        <div className="account-settings__identity-copy">
          <strong>{t('account.states.authorizing')}</strong>
          <span className="account-settings__secondary">
            {t('account.states.authorizingHint')}
          </span>
        </div>
        <Button variant="secondary" size="small" disabled>
          {t('account.actions.waiting')}
        </Button>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="account-settings__identity" data-auth-status="error" role="alert">
        <div className="account-settings__avatar account-settings__avatar--error" aria-hidden="true">
          <AlertCircle size={18} />
        </div>
        <div className="account-settings__identity-copy">
          <strong>{t('account.states.error')}</strong>
          <span className="account-settings__secondary">{t(errorKey(state.category))}</span>
        </div>
        <Button variant="secondary" size="small" onClick={onClearError}>
          {t('account.actions.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="account-settings__identity" data-auth-status="anonymous">
      <div className="account-settings__avatar account-settings__avatar--muted" aria-hidden="true">
        <CircleUserRound size={19} />
      </div>
      <div className="account-settings__identity-copy">
        <strong>{t('account.states.anonymous')}</strong>
        <span className="account-settings__secondary">
          {webAuthorizationAvailable
            ? t('account.states.anonymousHint')
            : t('account.states.unavailableHint')}
        </span>
      </div>
      <Button
        variant="primary"
        size="small"
        disabled={!webAuthorizationAvailable}
        onClick={onStartWebAuthorization}
      >
        <ExternalLink size={14} aria-hidden="true" />
        {t('account.actions.webSignIn')}
      </Button>
    </div>
  );
}

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = props => (
  <ConfigPageLayout className="account-settings">
    <ConfigPageHeader
      title={props.t('account.title')}
      subtitle={props.t('account.subtitle')}
    />
    <ConfigPageContent>
      <ConfigPageSection
        className="account-settings__section--profile"
        title={props.t('account.profile.title')}
        description={props.t('account.profile.description')}
      >
        <AccountIdentity {...props} />
      </ConfigPageSection>

      <ConfigPageSection
        className="account-settings__section--usage"
        title={props.t('account.usage.title')}
        description={props.t('account.usage.description')}
      >
        <AccountUsageOverviewView state={props.usageState} t={props.t} />
      </ConfigPageSection>

      {props.subscriptionAccounts && (
        <ConfigPageSection
          className="account-settings__section--subscriptions"
          title={props.t('account.subscriptions.title')}
          description={props.t('account.subscriptions.description')}
        >
          {props.subscriptionAccounts}
        </ConfigPageSection>
      )}

      <ConfigPageSection
        title={props.t('account.security.title')}
        description={props.t('account.security.description')}
      >
        <ConfigPageRow
          align="center"
          label={props.t('account.security.browser.title')}
          description={props.t('account.security.browser.description')}
        >
          <span className="account-settings__quiet-state">
            {props.t('account.security.browser.value')}
          </span>
        </ConfigPageRow>
        <ConfigPageRow
          align="center"
          label={props.t('account.security.credentials.title')}
          description={props.t('account.security.credentials.description')}
        >
          <span className="account-settings__secure-state">
            <ShieldCheck size={14} aria-hidden="true" />
            {props.t('account.security.credentials.value')}
          </span>
        </ConfigPageRow>
      </ConfigPageSection>
    </ConfigPageContent>
  </ConfigPageLayout>
);

export interface AccountSettingsProps {
  controller?: AuthSessionController;
  usageClient?: AccountUsageClient;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({
  controller = defaultAuthSessionController,
  usageClient,
}) => {
  const { t } = useI18n('settings');
  const snapshot = useAuthSession(controller);
  const usageState = useAccountUsage(usageClient);

  return (
    <AccountSettingsView
      snapshot={snapshot}
      usageState={usageState}
      subscriptionAccounts={<SubscriptionAccountsPanel />}
      onStartWebAuthorization={() => void controller.startWebAuthorization()}
      onClearError={controller.clearError}
      onSignOut={() => void controller.signOut()}
      t={t}
    />
  );
};

export default AccountSettings;
