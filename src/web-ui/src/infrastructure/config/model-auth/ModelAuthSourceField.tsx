import React from 'react';
import { Button, Select, type SelectOption } from '@/component-library';
import type { DiscoveredCliCredential } from '@/infrastructure/api/service-api/AIApi';
import type { AuthConfig } from '../types';
import {
  accountStatusFor,
  authFromOption,
  authOptionValue,
  type SubscriptionAccountReadState,
} from './modelSubscriptionAuth';

interface ModelAuthSourceFieldProps {
  auth?: AuthConfig;
  discoveredCli: readonly DiscoveredCliCredential[];
  subscriptions: SubscriptionAccountReadState;
  onChange(auth: AuthConfig): void;
  onOpenAccountSettings(): void;
  t(key: string, options?: Record<string, unknown>): string;
}

export function ModelAuthSourceField({
  auth,
  discoveredCli,
  subscriptions,
  onChange,
  onOpenAccountSettings,
  t,
}: ModelAuthSourceFieldProps) {
  const value = authOptionValue(auth);
  const options: SelectOption[] = [
    { value: 'api_key', label: t('cliAuth.options.apiKey') },
    { value: 'codex_cli', label: t('cliAuth.options.codexCli') },
    { value: 'gemini_cli', label: t('cliAuth.options.geminiCli') },
    { value: 'subscription:codex', label: t('subscriptionAuth.options.codex') },
    { value: 'subscription:opencode', label: t('subscriptionAuth.options.opencode') },
  ];

  let hint: React.ReactNode = null;
  let hintIsError = false;
  if (auth?.type === 'codex_cli' || auth?.type === 'gemini_cli') {
    const kind = auth.type === 'codex_cli' ? 'codex' : 'gemini';
    const credential = discoveredCli.find(item => item.kind === kind);
    hintIsError = !credential;
    hint = credential
      ? t('cliAuth.detected', {
        label: credential.display_label,
        account: credential.account || t('cliAuth.unknownAccount'),
      })
      : t('cliAuth.notDetected', {
        kind: auth.type === 'codex_cli' ? 'Codex CLI' : 'Gemini CLI',
      });
  } else if (auth?.type === 'subscription') {
    const status = accountStatusFor(subscriptions, auth.provider);
    if (status === 'connected') {
      const account = subscriptions.status === 'ready'
        ? subscriptions.accounts.get(auth.provider)
        : undefined;
      hint = t('subscriptionAuth.connected', {
        account: account?.accountHint || t('subscriptionAuth.currentAccount'),
      });
    } else if (status === 'loading') {
      hint = t('subscriptionAuth.loading');
    } else {
      hintIsError = true;
      hint = (
        <>
          <span>{t(`subscriptionAuth.status.${status}`)}</span>
          <Button variant="ghost" size="small" onClick={onOpenAccountSettings}>
            {t('subscriptionAuth.openAccountSettings')}
          </Button>
        </>
      );
    }
  }

  return (
    <div className="void-ai-model-config__control-stack">
      <Select
        value={value}
        onChange={next => onChange(authFromOption(String(next)))}
        options={options}
        size="small"
      />
      {hint && (
        <small
          className={[
            'resolved-url__hint',
            'void-ai-model-config__cli-auth-hint',
            hintIsError ? 'void-ai-model-config__json-status--error' : '',
          ].filter(Boolean).join(' ')}
          data-auth-source-status={auth?.type === 'subscription'
            ? accountStatusFor(subscriptions, auth.provider)
            : undefined}
        >
          {hint}
        </small>
      )}
    </div>
  );
}
