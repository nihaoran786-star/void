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
import { useI18n } from '@/infrastructure/i18n';
import {
  ConfigPageContent,
  ConfigPageHeader,
  ConfigPageLayout,
  ConfigPageRow,
  ConfigPageSection,
} from '@/infrastructure/config/components/common';
import './AccountSettings.scss';

type Translate = (key: string) => string;

export interface AccountSettingsViewProps {
  snapshot: AuthSessionSnapshot;
  usageState: AccountUsageState;
  onStartWebAuthorization: () => void;
  onClearError: () => void;
  onSignOut: () => void;
  t: Translate;
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
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
  const firstDate = daily[0]?.date;
  const firstWeekday = firstDate
    ? new Date(`${firstDate}T00:00:00Z`).getUTCDay()
    : 1;
  const leadingEmptyCells = (firstWeekday + 6) % 7;

  return (
    <div
      className="account-settings__heatmap"
      role="img"
      aria-label={t('account.usage.activityAriaLabel')}
    >
      {Array.from({ length: leadingEmptyCells }, (_, index) => (
        <span
          key={`leading-${index}`}
          className="account-settings__heat-cell account-settings__heat-cell--empty"
          aria-hidden="true"
        />
      ))}
      {daily.map(day => (
        <span
          key={day.date}
          className={`account-settings__heat-cell account-settings__heat-cell--${heatLevel(day.totalTokens, peak)}`}
          title={`${day.date} · ${formatTokenCount(day.totalTokens)} Tokens`}
          aria-hidden="true"
        />
      ))}
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
  const metrics = [
    [formatTokenCount(overview.totalTokens), t('account.usage.metrics.totalTokens')],
    [formatTokenCount(overview.peakDailyTokens), t('account.usage.metrics.peakTokens')],
    [String(overview.activeDays), t('account.usage.metrics.activeDays')],
    [String(overview.currentStreakDays), t('account.usage.metrics.currentStreak')],
    [String(overview.longestStreakDays), t('account.usage.metrics.longestStreak')],
  ];

  return (
    <div className="account-settings__usage" data-usage-status={state.status}>
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
        title={props.t('account.profile.title')}
        description={props.t('account.profile.description')}
      >
        <AccountIdentity {...props} />
      </ConfigPageSection>

      <ConfigPageSection
        title={props.t('account.usage.title')}
        description={props.t('account.usage.description')}
      >
        <AccountUsageOverviewView state={props.usageState} t={props.t} />
      </ConfigPageSection>

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
      onStartWebAuthorization={() => void controller.startWebAuthorization()}
      onClearError={controller.clearError}
      onSignOut={() => void controller.signOut()}
      t={t}
    />
  );
};

export default AccountSettings;
