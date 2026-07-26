/**
 * Tool card metadata registry.
 * Keep display names and confirmation policy independent from heavy card components.
 */

import type { ToolCardConfig } from '../types/flow-chat';
import { isMcpToolName, parseMcpToolName } from '@/infrastructure/mcp/toolName';

// Tool card config map - uses backend tool names
export const TOOL_CARD_CONFIGS: Record<string, ToolCardConfig> = {
  // File tools
  'Read': {
    toolName: 'Read',
    displayName: 'Read File',
    icon: 'R',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: 'Read file contents',
    displayMode: 'compact',
    primaryColor: '#3b82f6'
  },
  'Write': {
    toolName: 'Write',
    displayName: 'Write File',
    icon: 'W',
    requiresConfirmation: false, // Snapshot system handles confirmation.
    resultDisplayType: 'summary',
    description: 'Write or create a file',
    displayMode: 'standard',
    primaryColor: '#22c55e'
  },
  'Edit': {
    toolName: 'Edit',
    displayName: 'Edit File',
    icon: 'E',
    requiresConfirmation: false, // Snapshot system handles confirmation.
    resultDisplayType: 'detailed',
    description: 'Edit file contents',
    displayMode: 'standard',
    primaryColor: '#f59e0b'
  },
  'Delete': {
    toolName: 'Delete',
    displayName: 'Delete File',
    icon: 'D',
    requiresConfirmation: false, // Snapshot system handles confirmation.
    resultDisplayType: 'summary',
    description: 'Delete a file',
    displayMode: 'detailed',
    primaryColor: '#ef4444'
  },
  'LS': {
    toolName: 'LS',
    displayName: 'List Directory',
    icon: 'L',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: 'List directory contents',
    displayMode: 'compact',
    primaryColor: '#6366f1'
  },

  // Search tools
  'Grep': {
    toolName: 'Grep',
    displayName: 'Text Search',
    icon: 'G',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Search text in files',
    displayMode: 'compact',
    primaryColor: '#8b5cf6'
  },
  'Glob': {
    toolName: 'Glob',
    displayName: 'File Search',
    icon: 'F',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: 'Search files by pattern',
    displayMode: 'compact',
    primaryColor: '#06b6d4'
  },

  // Web tools
  'WebSearch': {
    toolName: 'WebSearch',
    displayName: 'Web Search',
    icon: 'WS',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Search the web',
    displayMode: 'compact',
    primaryColor: '#0ea5e9'
  },
  'WebFetch': {
    toolName: 'WebFetch',
    displayName: 'Fetch Link',
    icon: 'WF',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Fetch webpage content',
    displayMode: 'standard',
    primaryColor: '#0ea5e9'
  },

  // Advanced tools
  'Task': {
    toolName: 'Task',
    displayName: 'Run Task',
    icon: '',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Run a specialized AI task',
    displayMode: 'detailed',
    primaryColor: '#7c3aed'
  },
  'TodoWrite': {
    toolName: 'TodoWrite',
    displayName: 'Task Manager',
    icon: 'T',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: 'Manage task lists',
    displayMode: 'standard',
    primaryColor: '#0d9488'
  },
  'submit_code_review': {
    toolName: 'submit_code_review',
    displayName: 'Code Review',
    icon: 'CR',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Submit code review results',
    displayMode: 'compact',
    primaryColor: '#8b5cf6'
  },
  'ContextCompression': {
    toolName: 'ContextCompression',
    displayName: 'Context Compression',
    icon: 'CC',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Compress conversation context to reduce tokens',
    displayMode: 'compact',
    primaryColor: '#a855f7'
  },

  // Skill tool
  'Skill': {
    toolName: 'Skill',
    displayName: 'Skill',
    icon: 'S',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Load and run skills',
    displayMode: 'compact',
    primaryColor: '#8b5cf6'
  },

  // AskUserQuestion tool
  'AskUserQuestion': {
    toolName: 'AskUserQuestion',
    displayName: 'Ask User',
    icon: 'Q',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Ask the user a question and wait for a reply',
    displayMode: 'detailed',
    primaryColor: '#8b5cf6'
  },

  'ReviewSessionSummary': {
    toolName: 'ReviewSessionSummary',
    displayName: 'Review summary',
    icon: 'REV',
    requiresConfirmation: false,
    resultDisplayType: 'hidden',
    description: 'Review session summary marker',
    displayMode: 'detailed',
    primaryColor: '#0ea5e9'
  },

  // Git version control tool
  'Git': {
    toolName: 'Git',
    displayName: 'Git',
    icon: 'GIT',
    requiresConfirmation: false, // Read-only needs no confirmation; writes are backend-controlled.
    resultDisplayType: 'detailed',
    description: 'Run Git commands',
    displayMode: 'compact',
    primaryColor: '#f97316' // Orange, Git brand color
  },

  // GetFileDiff tool
  'GetFileDiff': {
    toolName: 'GetFileDiff',
    displayName: 'File Diff',
    icon: 'DIFF',
    requiresConfirmation: false, // Read-only tool.
    resultDisplayType: 'detailed',
    description: 'Get file diffs (Baseline/Git/Full)',
    displayMode: 'compact',
    primaryColor: '#8b5cf6' // Purple
  },

  // CreatePlan tool
  'CreatePlan': {
    toolName: 'CreatePlan',
    displayName: 'Create Plan',
    icon: 'PLAN',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Create and manage project plans',
    displayMode: 'detailed',
    primaryColor: '#f59e0b' // Orange
  },

  // TerminalControl tool
  'TerminalControl': {
    toolName: 'TerminalControl',
    displayName: 'Terminal Control',
    icon: 'TC',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: 'Kill or interrupt a terminal session',
    displayMode: 'compact',
    primaryColor: '#ef4444'
  },

  'SessionControl': {
    toolName: 'SessionControl',
    displayName: 'Session Control',
    icon: 'SC',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: 'Create, delete, or list sessions',
    displayMode: 'compact',
    primaryColor: '#3b82f6'
  },

  'SessionMessage': {
    toolName: 'SessionMessage',
    displayName: 'Session Message',
    icon: 'SM',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: 'Send a message to another session',
    displayMode: 'compact',
    primaryColor: '#8b5cf6'
  },

  // Bash terminal tool
  'Bash': {
    toolName: 'Bash',
    displayName: 'Run Command',
    icon: 'TERM',
    requiresConfirmation: true, // Requires user confirmation.
    resultDisplayType: 'detailed',
    description: 'Run commands in the terminal',
    displayMode: 'standard',
    primaryColor: '#10b981' // Teal, classic terminal color
  },

  // MiniApp tool
  'InitMiniApp': {
    toolName: 'InitMiniApp',
    displayName: 'Init Mini App',
    icon: 'APP',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Create Mini App skeleton for editing',
    displayMode: 'standard',
    primaryColor: '#7c8cef'
  },
  'GenerativeUI': {
    toolName: 'GenerativeUI',
    displayName: 'Generative UI',
    icon: 'UI',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Render interactive widget previews inline in FlowChat',
    displayMode: 'detailed',
    primaryColor: '#38bdf8'
  },
  'GenerateImage': {
    toolName: 'GenerateImage',
    displayName: 'Generate Image',
    icon: 'IMG',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Generate images through the media provider',
    displayMode: 'detailed',
    primaryColor: '#2563eb'
  },
  'GenerateVideo': {
    toolName: 'GenerateVideo',
    displayName: 'Generate Video',
    icon: 'VID',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Generate videos through the media provider',
    displayMode: 'detailed',
    primaryColor: '#7c3aed'
  },
  'UploadMediaImage': {
    toolName: 'UploadMediaImage',
    displayName: 'Upload Media',
    icon: 'UP',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Upload a local image for media generation',
    displayMode: 'detailed',
    primaryColor: '#0f766e'
  },
  'GenerateSpeech': {
    toolName: 'GenerateSpeech',
    displayName: 'Generate Speech',
    icon: 'AUD',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Generate speech audio through the media provider',
    displayMode: 'detailed',
    primaryColor: '#0891b2'
  },
  'TranscribeAudio': {
    toolName: 'TranscribeAudio',
    displayName: 'Transcribe Audio',
    icon: 'TXT',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Transcribe audio through the media provider',
    displayMode: 'detailed',
    primaryColor: '#0891b2'
  },
  'GetMediaTaskStatus': {
    toolName: 'GetMediaTaskStatus',
    displayName: 'Media Task Status',
    icon: 'STS',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Query a media provider task status',
    displayMode: 'detailed',
    primaryColor: '#64748b'
  },
  'ViewImage': {
    toolName: 'ViewImage',
    displayName: 'View Image',
    icon: 'IMG',
    requiresConfirmation: false,
    resultDisplayType: 'detailed',
    description: 'Preview a workspace image',
    displayMode: 'detailed',
    primaryColor: '#2563eb'
  },
};

/**
 * Get tool card config.
 */
export function getToolCardConfig(toolName: string): ToolCardConfig {
  // Check MCP tools (prefix: mcp__).
  if (isMcpToolName(toolName)) {
    const parsed = parseMcpToolName(toolName);
    const actualToolName = parsed?.toolName ?? toolName;

    return {
      toolName,
      displayName: actualToolName || toolName,
      icon: 'MCP',
      requiresConfirmation: false,
      resultDisplayType: 'detailed',
      description: 'MCP',
      displayMode: 'compact',
      primaryColor: '#8b5cf6'
    };
  }

  // Match by name or fall back to defaults.
  return TOOL_CARD_CONFIGS[toolName] || {
    toolName,
    displayName: `Tool: ${toolName}`,
    icon: 'TOOL',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
    description: `Run ${toolName} tool`,
    displayMode: 'standard',
    primaryColor: '#6b7280'
  };
}

/**
 * Check whether a tool needs confirmation.
 */
export function requiresConfirmation(toolName: string): boolean {
  const config = getToolCardConfig(toolName);
  return config.requiresConfirmation;
}

/**
 * Get all registered tool names.
 */
export function getAllToolNames(): string[] {
  return Object.keys(TOOL_CARD_CONFIGS);
}
