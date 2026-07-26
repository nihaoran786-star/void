import {
  ExternalLink,
  KeyRound,
  LoaderCircle,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/component-library/components/Button';
import { useI18n } from '@/infrastructure/i18n';
import type {
  SubscriptionAccount,
  SubscriptionAuthError,
  SubscriptionProvider,
} from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import { SUBSCRIPTION_AUTH_DESKTOP_UPDATE_REQUIRED } from '@/infrastructure/api/service-api/SubscriptionAuthAPI';
import { useSubscriptionAuth } from './useSubscriptionAuth';
import type { SubscriptionAuthViewModel } from './subscriptionAuthTypes';
import './SubscriptionAccountsPanel.scss';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const PROVIDER_LABEL_KEYS: Record<SubscriptionProvider, string> = {
  codex: 'account.subscriptions.providers.codex',
  opencode: 'account.subscriptions.providers.opencode',
};

function formatExpiry(expiresAt: number | null): string | null {
  if (expiresAt === null) {
    return null;
  }
  const milliseconds = expiresAt < 10_000_000_000 ? expiresAt * 1_000 : expiresAt;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
}

function errorMessage(error: SubscriptionAuthError, t: Translate): string {
  return error.code === SUBSCRIPTION_AUTH_DESKTOP_UPDATE_REQUIRED
    ? t('account.subscriptions.errors.desktop_update_required')
    : error.message;
}

function AccountDescription({
  account,
  t,
}: {
  account: SubscriptionAccount;
  t: Translate;
}) {
  const expiry = formatExpiry(account.expiresAt);
  if (account.status === 'connected') {
    return (
      <>
        <span>{account.accountHint || t('account.subscriptions.unknownAccount')}</span>
        {expiry && <span>{t('account.subscriptions.expiresAt', { date: expiry })}</span>}
      </>
    );
  }
  if (account.status === 'vault_unavailable') {
    return <span>{t('account.subscriptions.states.vault_unavailableHint')}</span>;
  }
  if (account.status === 'failed') {
    return (
      <span>
        {account.error
          ? errorMessage(account.error, t)
          : t('account.subscriptions.states.failedHint')}
      </span>
    );
  }
  return <span>{t('account.subscriptions.states.disconnectedHint')}</span>;
}

export interface SubscriptionAccountsPanelViewProps {
  model: SubscriptionAuthViewModel;
  t: Translate;
}

export function SubscriptionAccountsPanelView({
  model,
  t,
}: SubscriptionAccountsPanelViewProps) {
  if (model.loadStatus === 'loading' && model.accounts.length === 0) {
    return (
      <div className="subscription-accounts__loading" aria-live="polite">
        <LoaderCircle className="subscription-accounts__spinner" size={16} aria-hidden="true" />
        {t('account.subscriptions.loading')}
      </div>
    );
  }

  return (
    <div className="subscription-accounts" aria-live="polite">
      {model.error && (
        <div className="subscription-accounts__global-error" role="alert">
          <ShieldAlert size={15} aria-hidden="true" />
          <span>{errorMessage(model.error, t)}</span>
          {model.error.retryable && (
            <Button variant="secondary" size="small" onClick={() => void model.reload()}>
              {t('account.subscriptions.actions.retry')}
            </Button>
          )}
        </div>
      )}

      <ul
        className="subscription-accounts__list"
        aria-label={t('account.subscriptions.listAriaLabel')}
      >
        {model.accounts.map(account => {
          const session = model.session?.provider === account.provider ? model.session : null;
          const pending = session?.status === 'pending';
          const busy = model.actionProvider === account.provider;
          const anotherLoginActive = (
            model.activeProvider !== null && model.activeProvider !== account.provider
          );
          const statusKey = `account.subscriptions.states.${account.status}`;

          return (
            <li
              className="subscription-accounts__item"
              data-provider={account.provider}
              data-account-status={account.status}
              key={account.provider}
            >
              <div className="subscription-accounts__icon" aria-hidden="true">
                <KeyRound size={17} />
              </div>
              <div className="subscription-accounts__copy">
                <div className="subscription-accounts__heading">
                  <strong>{t(PROVIDER_LABEL_KEYS[account.provider])}</strong>
                  <span
                    className={`subscription-accounts__status subscription-accounts__status--${account.status}`}
                    aria-label={t('account.subscriptions.statusAriaLabel', {
                      provider: t(PROVIDER_LABEL_KEYS[account.provider]),
                      status: t(statusKey),
                    })}
                  >
                    {t(statusKey)}
                  </span>
                </div>
                <div className="subscription-accounts__description">
                  <AccountDescription account={account} t={t} />
                </div>

                {session && (
                  <div
                    className={`subscription-accounts__session subscription-accounts__session--${session.status}`}
                    role={session.status === 'failed' ? 'alert' : 'status'}
                  >
                    {pending && (
                      <>
                        <span>{t('account.subscriptions.login.pending')}</span>
                        {session.userCode && (
                          <span>
                            {t('account.subscriptions.login.code')}
                            {' '}
                            <code>{session.userCode}</code>
                          </span>
                        )}
                        {session.error && (
                          <span className="subscription-accounts__open-error" role="alert">
                            {t('account.subscriptions.login.openFailed', {
                              error: session.error.message,
                            })}
                          </span>
                        )}
                      </>
                    )}
                    {session.status === 'authorized' && (
                      <span>{t('account.subscriptions.login.authorized')}</span>
                    )}
                    {session.status === 'cancelled' && (
                      <span>{t('account.subscriptions.login.cancelled')}</span>
                    )}
                    {session.status === 'failed' && (
                      <span>
                        {session.error?.message || t('account.subscriptions.login.failed')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="subscription-accounts__actions">
                {pending ? (
                  <>
                    {session.authorizationUrl && (
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => void model.openAuthorization(session.authorizationUrl!)}
                      >
                        <ExternalLink size={13} aria-hidden="true" />
                        {t('account.subscriptions.actions.open')}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => void model.cancelLogin()}
                    >
                      {t('account.subscriptions.actions.cancel')}
                    </Button>
                  </>
                ) : account.status === 'connected' ? (
                  <>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={busy}
                      onClick={() => void model.refresh(account.provider)}
                    >
                      <RefreshCw size={13} aria-hidden="true" />
                      {t('account.subscriptions.actions.refresh')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={busy}
                      onClick={() => void model.logout(account.provider)}
                    >
                      <LogOut size={13} aria-hidden="true" />
                      {t('account.subscriptions.actions.logout')}
                    </Button>
                  </>
                ) : account.status === 'vault_unavailable'
                  || (account.status === 'failed' && account.error?.retryable !== false) ? (
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={model.loadStatus === 'loading'}
                    onClick={() => void model.reload()}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    {t('account.subscriptions.actions.retry')}
                  </Button>
                ) : account.status !== 'failed' ? (
                  <Button
                    variant="primary"
                    size="small"
                    disabled={anotherLoginActive}
                    onClick={() => void model.startLogin(account.provider)}
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    {t('account.subscriptions.actions.login')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SubscriptionAccountsPanel() {
  const { t } = useI18n('settings');
  const model = useSubscriptionAuth();
  return <SubscriptionAccountsPanelView model={model} t={t} />;
}
