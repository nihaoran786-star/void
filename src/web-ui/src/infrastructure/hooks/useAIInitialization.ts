 

import { useEffect, useState, useCallback } from 'react';
import { ModelConfig } from '../../shared/types';
import { AIService } from '../services/api/aiService';
import { createLogger } from '@/shared/utils/logger';
import { useI18n } from '@/infrastructure/i18n';

const log = createLogger('useAIInitialization');

export interface AIInitializationState {
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
  currentConfig: ModelConfig | null;
}

export type AIInitializationReadiness =
  | { ready: true }
  | {
      ready: false;
      reason: 'missing_config' | 'missing_model_name' | 'missing_base_url' | 'missing_api_key';
    };

export function getAIInitializationReadiness(
  config?: ModelConfig | null,
): AIInitializationReadiness {
  if (!config) return { ready: false, reason: 'missing_config' };
  if (!config.modelName) return { ready: false, reason: 'missing_model_name' };
  if (!config.baseUrl) return { ready: false, reason: 'missing_base_url' };
  if ((!config.auth || config.auth.type === 'api_key') && !config.apiKey) {
    return { ready: false, reason: 'missing_api_key' };
  }

  return { ready: true };
}

 
export const useAIInitialization = (currentConfig?: ModelConfig | null) => {
  const { t } = useI18n('errors');
  const [state, setState] = useState<AIInitializationState>({
    isInitialized: AIService.isAIInitialized(),
    isInitializing: false,
    error: null,
    currentConfig: AIService.getCurrentConfig()
  });


  
  const initializeAI = useCallback(async (config: ModelConfig) => {
    if (!config) {
      setState(prev => ({ ...prev, error: t('ai.configRequired') }));
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isInitializing: true, 
      error: null 
    }));

    try {
      await AIService.initializeAI(config);
      setState(prev => ({
        ...prev,
        isInitialized: true,
        isInitializing: false,
        currentConfig: config,
        error: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isInitialized: false,
        isInitializing: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [t]);

  
  const resetAI = useCallback(() => {
    AIService.reset();
    setState({
      isInitialized: false,
      isInitializing: false,
      error: null,
      currentConfig: null
    });
  }, []);

  
  useEffect(() => {
    const readiness = getAIInitializationReadiness(currentConfig);
    if (currentConfig && readiness.ready) {
      
      const needsInitialization = !state.isInitialized || 
                                 state.currentConfig?.id !== currentConfig.id;
      
      if (needsInitialization && !state.isInitializing) {
        log.info('Initializing AI client', { 
          configId: currentConfig.id,
          configName: currentConfig.name 
        });
        
        
        AIService.autoInitialize(currentConfig).catch(error => {
          log.error('Auto initialization failed', error);
          setState(prev => ({
            ...prev,
            isInitialized: false,
            isInitializing: false,
            error: error instanceof Error ? error.message : String(error)
          }));
        });
      }
    } else if (currentConfig) {
      log.warn('Model configuration incomplete', {
        configName: currentConfig.name,
        reason: readiness.ready ? undefined : readiness.reason,
        authType: currentConfig.auth?.type || 'api_key',
      });
    }
  }, [currentConfig, state.isInitialized, state.isInitializing, state.currentConfig?.id]);

  
  useEffect(() => {
    const handleAIInitialized = (event: CustomEvent) => {
      const { config } = event.detail;
      setState(prev => ({
        ...prev,
        isInitialized: true,
        isInitializing: false,
        currentConfig: config,
        error: null
      }));
    };

    const handleAIError = (event: CustomEvent) => {
      const { error } = event.detail;
      setState(prev => ({
        ...prev,
        isInitialized: false,
        isInitializing: false,
        error
      }));
    };

    const handleAIReset = () => {
      setState({
        isInitialized: false,
        isInitializing: false,
        error: null,
        currentConfig: null
      });
    };

    window.addEventListener('ai:initialized', handleAIInitialized as EventListener);
    window.addEventListener('ai:error', handleAIError as EventListener);
    window.addEventListener('ai:reset', handleAIReset);

    return () => {
      window.removeEventListener('ai:initialized', handleAIInitialized as EventListener);
      window.removeEventListener('ai:error', handleAIError as EventListener);
      window.removeEventListener('ai:reset', handleAIReset);
    };
  }, []);

  return {
    ...state,
    initializeAI,
    resetAI
  };
};
