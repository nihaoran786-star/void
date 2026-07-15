/**
 * Tool Execution Service
 * Manages tool execution events from backend and integrates with frontend
 */

import { 
  ToolExecutionInfo, 
  ToolResult, 
  ToolDisplayMessage,
  BashToolResult,
  FileToolResult,
  SearchToolResult,
  WebToolResult,
  AdvancedToolResult
} from '../types/tool-display';
import { createLogger } from '@/shared/utils/logger';
import { isTauriRuntime } from '@/infrastructure/runtime/environment';

const log = createLogger('ToolExecutionService');

export interface ToolExecutionStartedEvent {
  tool_use_id: string;
  tool_name: string;
  user_facing_name?: string;
  input: Record<string, any>;
  agent_type?: string;
  session_id?: string;
  timestamp: number;
}

export interface ToolExecutionProgressEvent {
  tool_use_id: string;
  tool_name: string;
  progress_message: string;
  percentage?: number;
  timestamp: number;
}

export interface ToolExecutionCompletedEvent {
  tool_use_id: string;
  tool_name: string;
  result: any;
  duration_ms: number;
  cost_usd?: number;
  timestamp: number;
}

export interface ToolExecutionErrorEvent {
  tool_use_id: string;
  tool_name: string;
  error_message: string;
  error_type: string;
  duration_ms?: number;
  timestamp: number;
}

export type ToolExecutionEventHandler = (message: ToolDisplayMessage) => void;
type UnlistenFn = () => void;

export class ToolExecutionService {
  private static instance: ToolExecutionService | null = null;
  private eventHandlers: Map<string, ToolExecutionEventHandler[]> = new Map();
  private activeExecutions: Map<string, ToolExecutionInfo> = new Map();
  private processedEvents: Set<string> = new Set(); 
  private listenersSetup: boolean = false;
  private unlistenFunctions: UnlistenFn[] = [];
  private inFlightUnlisteners: UnlistenFn[] | null = null;
  private listenerGeneration = 0;
  private destroyed = false;

  static getInstance(): ToolExecutionService {
    if (!ToolExecutionService.instance) {
      ToolExecutionService.instance = new ToolExecutionService();
    }
    return ToolExecutionService.instance;
  }

  static destroyExistingInstance(): void {
    ToolExecutionService.instance?.destroy();
  }

  private constructor() {
    const generation = ++this.listenerGeneration;
    void this.setupEventListeners(generation);
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.listenerGeneration += 1;
    if (this.inFlightUnlisteners) {
      this.releaseUnlisteners(this.inFlightUnlisteners);
      this.inFlightUnlisteners = null;
    }
    this.releaseUnlisteners(this.unlistenFunctions);
    this.listenersSetup = false;
    this.eventHandlers.clear();
    this.activeExecutions.clear();
    this.processedEvents.clear();
    if (ToolExecutionService.instance === this) {
      ToolExecutionService.instance = null;
    }
  }

  private async setupEventListeners(generation: number): Promise<void> {
    if (this.listenersSetup || !isTauriRuntime()) {
      return;
    }

    const localUnlisteners: UnlistenFn[] = [];
    this.inFlightUnlisteners = localUnlisteners;

    try {
      const { listen } = await import('@tauri-apps/api/event');
      if (!this.isCurrentGeneration(generation)) return;

      const register = async <T>(
        eventName: string,
        handler: (payload: T) => void,
      ): Promise<boolean> => {
        const unlisten = await listen<T>(eventName, event => {
          if (this.isCurrentGeneration(generation)) {
            handler(event.payload);
          }
        });

        if (!this.isCurrentGeneration(generation)) {
          this.releaseUnlisteners([unlisten]);
          return false;
        }

        localUnlisteners.push(unlisten);
        return true;
      };

      if (!await register<ToolExecutionStartedEvent>(
        'backend-event-toolexecutionstarted',
        payload => this.handleToolExecutionStarted(payload),
      )) {
        this.releaseUnlisteners(localUnlisteners);
        return;
      }
      if (!await register<ToolExecutionProgressEvent>(
        'backend-event-toolexecutionprogress',
        payload => this.handleToolExecutionProgress(payload),
      )) {
        this.releaseUnlisteners(localUnlisteners);
        return;
      }
      if (!await register<ToolExecutionCompletedEvent>(
        'backend-event-toolexecutioncompleted',
        payload => this.handleToolExecutionCompleted(payload),
      )) {
        this.releaseUnlisteners(localUnlisteners);
        return;
      }
      if (!await register<ToolExecutionErrorEvent>(
        'backend-event-toolexecutionerror',
        payload => this.handleToolExecutionError(payload),
      )) {
        this.releaseUnlisteners(localUnlisteners);
        return;
      }

      if (!this.isCurrentGeneration(generation)) {
        this.releaseUnlisteners(localUnlisteners);
        return;
      }

      this.unlistenFunctions.push(...localUnlisteners.splice(0));
      this.listenersSetup = true;
    } catch (error) {
      this.releaseUnlisteners(localUnlisteners);
      if (this.isCurrentGeneration(generation)) {
        log.error('Failed to setup event listeners', error);
      }
    } finally {
      if (this.inFlightUnlisteners === localUnlisteners) {
        this.inFlightUnlisteners = null;
      }
    }
  }

  private isCurrentGeneration(generation: number): boolean {
    return !this.destroyed && this.listenerGeneration === generation;
  }

  private releaseUnlisteners(unlisteners: UnlistenFn[]): void {
    for (const unlisten of unlisteners.splice(0)) {
      try {
        unlisten();
      } catch (error) {
        log.warn('Failed to remove tool execution event listener', error);
      }
    }
  }

  private rememberProcessedEvent(eventKey: string): boolean {
    if (this.processedEvents.has(eventKey)) return false;

    this.processedEvents.add(eventKey);
    if (this.processedEvents.size > 1000) {
      const oldestEventKey = this.processedEvents.values().next().value;
      if (oldestEventKey !== undefined) {
        this.processedEvents.delete(oldestEventKey);
      }
    }
    return true;
  }

  private handleToolExecutionStarted(event: ToolExecutionStartedEvent) {
    
    // Extract data from the nested event structure
    const eventData = (event as any).value || event;
    const toolUseId = eventData.tool_use_id || 'unknown';
    
    
    const eventKey = `started_${toolUseId}_${eventData.timestamp}`;
    if (!this.rememberProcessedEvent(eventKey)) return;
    
    const toolExecution: ToolExecutionInfo = {
      id: toolUseId,
      toolName: eventData.tool_name || 'unknown',
      userFacingName: eventData.user_facing_name,
      input: eventData.input || {},
      startTime: eventData.timestamp || Date.now(),
      status: 'executing',
      aiIntent: eventData.ai_intent 
    };

    this.activeExecutions.set(toolExecution.id, toolExecution);

    const displayMessage: ToolDisplayMessage = {
      id: `tool_exec_${toolExecution.id}`,
      type: 'tool_use',
      toolExecution,
      timestamp: toolExecution.startTime
    };

    this.emitEvent('tool_started', displayMessage);
  }

  private handleToolExecutionProgress(event: ToolExecutionProgressEvent) {
    const execution = this.activeExecutions.get(event.tool_use_id);
    if (execution) {
      execution.status = 'executing';
      execution.progressMessage = event.progress_message; 
      execution.progressPercentage = event.percentage; 
      
      const displayMessage: ToolDisplayMessage = {
        id: `tool_progress_${event.tool_use_id}_${Date.now()}`,
        type: 'tool_use',
        toolExecution: execution,
        timestamp: event.timestamp
      };

      this.emitEvent('tool_progress', displayMessage);
    } else {
      log.warn('Tool execution not found', { toolUseId: event.tool_use_id });
    }
  }

  private handleToolExecutionCompleted(event: ToolExecutionCompletedEvent) {
    
    // Extract data from the nested event structure
    const eventData = (event as any).value || event;
    const toolUseId = eventData.tool_use_id || 'unknown';
    
    
    const eventKey = `completed_${toolUseId}_${eventData.timestamp}`;
    if (!this.rememberProcessedEvent(eventKey)) return;
    
    const execution = this.activeExecutions.get(toolUseId);
    if (execution) {
      execution.status = 'completed';
      execution.durationMs = eventData.duration_ms;
      execution.costUSD = eventData.cost_usd;
    }

    // Parse and normalize tool result based on tool type
    const normalizedResult = this.normalizeToolResult(eventData.result, eventData.tool_name);

    const toolResult: ToolResult = {
      toolUseId: toolUseId,
      toolName: eventData.tool_name || 'unknown',
      data: normalizedResult,
      isError: false,
      timestamp: eventData.timestamp || Date.now()
    };

    const displayMessage: ToolDisplayMessage = {
      id: `tool_result_${toolResult.toolUseId}`,
      type: 'tool_result',
      toolResult,
      timestamp: toolResult.timestamp
    };

    this.activeExecutions.delete(toolUseId);
    this.emitEvent('tool_completed', displayMessage);
  }

  private handleToolExecutionError(event: ToolExecutionErrorEvent) {
    
    // Extract data from the nested event structure
    const eventData = (event as any).value || event;
    
    const execution = this.activeExecutions.get(eventData.tool_use_id);
    if (execution) {
      execution.status = 'error';
      execution.error = eventData.error_message;
      execution.durationMs = eventData.duration_ms;
    }

    const toolResult: ToolResult = {
      toolUseId: eventData.tool_use_id || 'unknown',
      toolName: eventData.tool_name || 'unknown',
      data: null,
      error: eventData.error_message || 'Unknown error',
      isError: true,
      timestamp: eventData.timestamp || Date.now()
    };

    const displayMessage: ToolDisplayMessage = {
      id: `tool_error_${toolResult.toolUseId}`,
      type: 'tool_result',
      toolResult,
      timestamp: toolResult.timestamp
    };

    this.activeExecutions.delete(eventData.tool_use_id);
    this.emitEvent('tool_error', displayMessage);
  }

  private normalizeToolResult(result: any, toolName: string): any {
    if (!result || typeof result !== 'object') {
      return result;
    }

    // Extract content if it's in the expected format
    const content = result.content || result;
    const normalizedName = toolName.toLowerCase().replace(/[_-]/g, '');

    switch (normalizedName) {
      case 'bash':
        return this.normalizeBashResult(content);
      case 'fileread':
      case 'filewrite':
      case 'fileedit':
        return this.normalizeFileResult(content, toolName);
      case 'grep':
      case 'glob':
      case 'ls':
        return this.normalizeSearchResult(content, toolName);
      case 'websearch':
      case 'webfetch':
        return this.normalizeWebResult(content, toolName);
      case 'task':
      case 'think':
      case 'todowrite':
        return this.normalizeAdvancedResult(content, toolName);
      default:
        return content;
    }
  }

  private normalizeBashResult(content: any): BashToolResult {
    if (typeof content === 'string') {
      return {
        stdout: content,
        stdoutLines: content.split('\n').length,
        stderr: '',
        stderrLines: 0,
        interrupted: false
      };
    }

    return {
      stdout: content.stdout || content.output || '',
      stdoutLines: content.stdoutLines || (content.stdout || content.output || '').split('\n').length,
      stderr: content.stderr || '',
      stderrLines: content.stderrLines || (content.stderr || '').split('\n').length,
      interrupted: content.interrupted || false,
      exitCode: content.exitCode
    };
  }

  private normalizeFileResult(content: any, toolName: string): FileToolResult {
    const operation = toolName.toLowerCase().includes('read') ? 'read' :
                     toolName.toLowerCase().includes('write') ? 'write' :
                     toolName.toLowerCase().includes('edit') ? 'edit' : 'multi-edit';

    return {
      content: content.content || content.data || content,
      filePath: content.filePath || content.path || content.file || 'unknown',
      operation,
      changes: content.changes,
      success: content.success !== false
    };
  }

  private normalizeSearchResult(content: any, _toolName: string): SearchToolResult {
    return {
      pattern: content.pattern || content.query || '',
      results: content.results || content.matches || [],
      totalMatches: content.totalMatches || content.total || (content.results?.length || 0),
      filesSearched: content.filesSearched || content.files
    };
  }

  private normalizeWebResult(content: any, _toolName: string): WebToolResult {
    return {
      url: content.url,
      query: content.query,
      content: content.content || content.text || '',
      title: content.title,
      results: content.results || content.searchResults
    };
  }


  private normalizeAdvancedResult(content: any, toolName: string): AdvancedToolResult {
    const type = toolName.toLowerCase().includes('task') ? 'task' :
                toolName.toLowerCase().includes('think') ? 'think' :
                toolName.toLowerCase().includes('todo') ? 'todo' :
                toolName.toLowerCase().includes('expert') ? 'expert' :
                toolName.toLowerCase().includes('architect') ? 'architect' : 'task';

    return {
      type,
      content: content.content || content.text || content.result || content,
      agentType: content.agentType || content.agent_type,
      todos: content.todos,
      thinking: content.thinking,
      suggestions: content.suggestions
    };
  }

  private emitEvent(eventType: string, message: ToolDisplayMessage) {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        log.error(`Error in event handler for ${eventType}`, error);
      }
    });

    // Also emit to 'all' handlers
    const allHandlers = this.eventHandlers.get('all') || [];
    allHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        log.error('Error in all event handler', error);
      }
    });
  }

  /**
   * Register event handler for tool execution events
   * @param eventType - 'tool_started', 'tool_progress', 'tool_completed', 'tool_error', or 'all'
   * @param handler - Handler function
   * @returns Cleanup function
   */
  public onToolEvent(eventType: string, handler: ToolExecutionEventHandler): () => void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);

    // Return cleanup function
    return () => {
      const currentHandlers = this.eventHandlers.get(eventType) || [];
      const index = currentHandlers.indexOf(handler);
      if (index > -1) {
        currentHandlers.splice(index, 1);
        this.eventHandlers.set(eventType, currentHandlers);
      }
    };
  }

  /**
   * Get current active tool executions
   */
  public getActiveExecutions(): ToolExecutionInfo[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Check if any tools are currently executing
   */
  public hasActiveExecutions(): boolean {
    return this.activeExecutions.size > 0;
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    ToolExecutionService.destroyExistingInstance();
  });
}
