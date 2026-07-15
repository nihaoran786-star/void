/**
 * Monaco theme manager (singleton).
 * Handles theme registration, switching, and change event subscription.
 */

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { VoidDarkTheme, VoidDarkThemeMetadata } from '../themes/void-dark.theme';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('ThemeManager');

export interface ThemeChangeEvent {
  previousThemeId: string;
  currentThemeId: string;
}

type ThemeChangeListener = (event: ThemeChangeEvent) => void;

class ThemeManager {
  private static instance: ThemeManager;
  
  private registeredThemes = new Set<string>();
  private currentThemeId: string = VoidDarkThemeMetadata.id;
  private listeners: ThemeChangeListener[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  
  private constructor() {}
  
  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }
  
  /**
   * Initialize theme system (idempotent).
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.registerTheme(VoidDarkThemeMetadata.id, VoidDarkTheme);
        await this.syncWithThemeService();
        this.initialized = true;
      })().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }

    await this.initPromise;
  }
  
  /**
   * Register a theme. Returns false if already registered.
   */
  public registerTheme(
    id: string,
    theme: monaco.editor.IStandaloneThemeData
  ): boolean {
    if (this.registeredThemes.has(id)) {
      return false;
    }
    
    try {
      monaco.editor.defineTheme(id, theme);
      this.registeredThemes.add(id);
      return true;
    } catch (error) {
      log.error('Failed to register theme', { themeId: id, error });
      return false;
    }
  }
  
  public forceRegisterTheme(
    id: string,
    theme: monaco.editor.IStandaloneThemeData
  ): void {
    try {
      monaco.editor.defineTheme(id, theme);
      this.registeredThemes.add(id);
    } catch (error) {
      log.error('Failed to force register theme', { themeId: id, error });
    }
  }
  
  public setTheme(themeId: string): void {
    if (themeId === this.currentThemeId) {
      return;
    }
    
    const previousThemeId = this.currentThemeId;
    
    try {
      monaco.editor.setTheme(themeId);
      this.currentThemeId = themeId;
      
      log.debug('Theme changed', { previousThemeId, currentThemeId: themeId });
      
      this.notifyListeners({
        previousThemeId,
        currentThemeId: themeId,
      });
    } catch (error) {
      log.error('Failed to set theme', { themeId, error });
    }
  }
  
  public getCurrentThemeId(): string {
    return this.currentThemeId;
  }
  
  public getDefaultThemeId(): string {
    return VoidDarkThemeMetadata.id;
  }
  
  public isThemeRegistered(id: string): boolean {
    return this.registeredThemes.has(id);
  }
  
  public getRegisteredThemes(): string[] {
    return Array.from(this.registeredThemes);
  }
  
  /**
   * Subscribe to theme changes. Returns unsubscribe function.
   */
  public onThemeChange(listener: ThemeChangeListener): () => void {
    this.listeners.push(listener);
    
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  private async syncWithThemeService(): Promise<void> {
    try {
      const { themeService } = await import('@/infrastructure/theme/core/ThemeService');
      const { monacoThemeSync } = await import('@/infrastructure/theme/integrations/MonacoThemeSync');
      const currentTheme = themeService.getCurrentTheme();
      
      if (currentTheme) {
        const themeId = currentTheme.monaco 
          ? currentTheme.id 
          : (currentTheme.type === 'dark' ? this.getDefaultThemeId() : 'vs');
        
        monacoThemeSync.syncTheme(currentTheme);
        this.currentThemeId = monacoThemeSync.getTargetMonacoThemeId(currentTheme) ?? themeId;
      }
      
      themeService.on('theme:after-change', (event) => {
        if (event.theme) {
          const previousThemeId = this.currentThemeId;
          monacoThemeSync.syncTheme(event.theme);
          const currentThemeId = monacoThemeSync.getTargetMonacoThemeId(event.theme);
          if (currentThemeId !== previousThemeId) {
            this.currentThemeId = currentThemeId;
            this.notifyListeners({ previousThemeId, currentThemeId });
          }
        }
      });
      
    } catch (error) {
      log.warn('Could not sync with ThemeService', error);
      monaco.editor.setTheme(this.getDefaultThemeId());
      throw error;
    }
  }
  
  private notifyListeners(event: ThemeChangeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        log.error('Error in theme change listener', error);
      }
    });
  }
}

export const themeManager = ThemeManager.getInstance();
export default ThemeManager;
