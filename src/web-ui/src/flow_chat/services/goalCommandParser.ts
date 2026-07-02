const GOAL_COMMAND_PATTERN = /^\/goal(?:\s+([\s\S]*))?$/i;

export type GoalCommandAction = 'activate' | 'pause' | 'resume' | 'clear' | 'edit';

export interface ParsedGoalCommand {
  action: GoalCommandAction;
  userHint?: string;
  goalText?: string;
}

export function parseGoalCommand(message: string): ParsedGoalCommand | null {
  const trimmed = message.trim();
  const match = trimmed.match(GOAL_COMMAND_PATTERN);
  if (!match) {
    return null;
  }
  const body = match[1]?.trim();
  if (!body) {
    return { action: 'activate' };
  }

  const [command, ...rest] = body.split(/\s+/);
  const remainder = body.slice(command.length).trim();
  switch (command.toLowerCase()) {
    case 'pause':
      return rest.length === 0 ? { action: 'pause' } : null;
    case 'resume':
      return rest.length === 0 ? { action: 'resume' } : null;
    case 'clear':
      return rest.length === 0 ? { action: 'clear' } : null;
    case 'edit':
      return remainder ? { action: 'edit', goalText: remainder } : null;
    default:
      return { action: 'activate', userHint: body };
  }
}

export function isGoalSlashCommand(message: string): boolean {
  return GOAL_COMMAND_PATTERN.test(message.trim());
}
