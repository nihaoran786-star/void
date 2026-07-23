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
  onStartWebAuthorization: () => void;
  onClearError: () => void;
  onSignOut: () => void;
  t: Translate;
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
}

const AccountSettings: React.FC<AccountSettingsProps> = ({
  controller = defaultAuthSessionController,
}) => {
  const { t } = useI18n('settings');
  const snapshot = useAuthSession(controller);

  return (
    <AccountSettingsView
      snapshot={snapshot}
      onStartWebAuthorization={() => void controller.startWebAuthorization()}
      onClearError={controller.clearError}
      onSignOut={() => void controller.signOut()}
      t={t}
    />
  );
};

export default AccountSettings;
