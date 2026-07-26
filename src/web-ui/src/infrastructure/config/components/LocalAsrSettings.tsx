import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Switch } from '@/component-library';
import type { LocalAsrStatus } from '@/infrastructure/api/service-api/LocalAsrAPI';
import { notificationService } from '@/shared/notification-system';
import { createLogger } from '@/shared/utils/logger';
import type { VoiceInputConfig } from '../types';
import {
  DEFAULT_VOICE_INPUT_CONFIG,
  localAsrConfigService,
} from '../services/LocalAsrConfigService';
import { ConfigPageRow, ConfigPageSection } from './common';

const log = createLogger('LocalAsrSettings');

type ViewStatus = 'loading' | 'ready' | 'failed';

export function LocalAsrSettings() {
  const { t } = useTranslation('settings/ai-model');
  const [config, setConfig] = useState<VoiceInputConfig>(DEFAULT_VOICE_INPUT_CONFIG);
  const [capability, setCapability] = useState<LocalAsrStatus | null>(null);
  const [viewStatus, setViewStatus] = useState<ViewStatus>('loading');
  const [saving, setSaving] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setCapability(await localAsrConfigService.getStatus());
      setViewStatus('ready');
    } catch (error) {
      log.warn('Failed to inspect local ASR status', { error });
      setCapability(null);
      setViewStatus('failed');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const loaded = await localAsrConfigService.loadConfig();
        if (cancelled) return;
        setConfig(loaded);
        await refreshStatus();
      } catch (error) {
        log.warn('Failed to load local ASR configuration', { error });
        if (!cancelled) setViewStatus('failed');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshStatus]);

  const save = async () => {
    setSaving(true);
    try {
      setConfig(await localAsrConfigService.saveConfig(config));
      await refreshStatus();
      notificationService.success(t('localAsr.saved'));
    } catch (error) {
      log.error('Failed to save local ASR configuration', { error });
      notificationService.error(t('localAsr.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = capability
    ? t(`localAsr.status.${capability.status}`)
    : viewStatus === 'loading'
      ? t('localAsr.status.loading')
      : t('localAsr.status.failed');
  const statusDescription = capability?.error
    ? t(`localAsr.errors.${capability.error.code}`)
    : viewStatus === 'failed'
      ? t('localAsr.errors.inspection_failed')
      : t('localAsr.statusDescription');

  return (
    <ConfigPageSection
      title={t('localAsr.title')}
      description={t('localAsr.description')}
      extra={(
        <div className="void-ai-model-config__provider-group-actions">
          <Button
            variant="ghost"
            size="small"
            onClick={() => void refreshStatus()}
            disabled={saving || viewStatus === 'loading'}
          >
            {t('localAsr.refresh')}
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? t('localAsr.saving') : t('localAsr.save')}
          </Button>
        </div>
      )}
    >
      <ConfigPageRow
        label={t('localAsr.enable')}
        description={t('localAsr.enableDescription')}
        align="center"
        className="void-ai-model-config__compact-row"
      >
        <Switch
          checked={config.enabled}
          onChange={event => setConfig(previous => ({
            ...previous,
            enabled: event.target.checked,
          }))}
          size="small"
          aria-label={t('localAsr.enable')}
        />
      </ConfigPageRow>
      <ConfigPageRow
        label={t('localAsr.modelDirectory')}
        description={t('localAsr.modelDirectoryDescription')}
        align="center"
        className="void-ai-model-config__compact-row"
      >
        <Input
          value={config.model_directory}
          onChange={event => setConfig(previous => ({
            ...previous,
            model_directory: event.target.value,
          }))}
          placeholder={t('localAsr.modelDirectoryPlaceholder')}
          inputSize="small"
          aria-label={t('localAsr.modelDirectory')}
        />
      </ConfigPageRow>
      <ConfigPageRow
        label={t('localAsr.modelId')}
        description={capability?.discoveredModels.length
          ? t('localAsr.discoveredModels', {
              models: capability.discoveredModels.join(', '),
            })
          : t('localAsr.modelIdDescription')}
        align="center"
        className="void-ai-model-config__compact-row"
      >
        <Input
          value={config.model_id}
          onChange={event => setConfig(previous => ({
            ...previous,
            model_id: event.target.value,
          }))}
          placeholder="sensevoice-small-int8"
          inputSize="small"
          aria-label={t('localAsr.modelId')}
        />
      </ConfigPageRow>
      <ConfigPageRow
        label={t('localAsr.capabilityStatus')}
        description={statusDescription}
        align="center"
        className="void-ai-model-config__compact-row"
      >
        <span
          role="status"
          aria-live="polite"
          data-local-asr-status={capability?.status ?? viewStatus}
        >
          {statusLabel}
        </span>
      </ConfigPageRow>
    </ConfigPageSection>
  );
}
