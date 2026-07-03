const GOAL_COMMAND_PATTERN = /^\/goal(?=\s|$)(?:\s+([\s\S]*))?$/i;

export type GoalCommandAction =
  | 'activate'
  | 'pause'
  | 'resume'
  | 'clear'
  | 'edit'
  | 'complete'
  | 'block'
  | 'set-budget'
  | 'clear-budget';

export interface ParsedGoalCommand {
  action: GoalCommandAction;
  userHint?: string;
  goalText?: string;
  tokenBudget?: number;
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
    case 'complete':
      return rest.length === 0 ? { action: 'complete' } : null;
    case 'block':
    case 'blocked':
      return rest.length === 0 ? { action: 'block' } : null;
    case 'budget': {
      if (rest.length !== 1) {
        return null;
      }
      if (rest[0].toLowerCase() === 'clear') {
        return { action: 'clear-budget' };
      }
      if (!/^\d+$/.test(rest[0])) {
        return null;
      }
      const tokenBudget = Number(rest[0]);
      return Number.isSafeInteger(tokenBudget) ? { action: 'set-budget', tokenBudget } : null;
    }
    default:
      return { action: 'activate', userHint: body };
  }
}

export function isGoalSlashCommand(message: string): boolean {
  return GOAL_COMMAND_PATTERN.test(message.trim());
}
