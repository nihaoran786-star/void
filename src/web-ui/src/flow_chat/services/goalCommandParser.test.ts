import { describe, expect, it } from 'vitest';
import { isGoalSlashCommand, parseGoalCommand } from './goalCommandParser';

describe('goalCommandParser', () => {
  it('parses /goal without a hint', () => {
    expect(parseGoalCommand('/goal')).toEqual({ action: 'activate' });
    expect(parseGoalCommand('/goal   ')).toEqual({ action: 'activate' });
  });

  it('parses /goal with a hint', () => {
    expect(parseGoalCommand('/goal fix login bug')).toEqual({
      action: 'activate',
      userHint: 'fix login bug',
    });
  });

  it('parses goal management commands', () => {
    expect(parseGoalCommand('/goal pause')).toEqual({ action: 'pause' });
    expect(parseGoalCommand('/goal resume')).toEqual({ action: 'resume' });
    expect(parseGoalCommand('/goal clear')).toEqual({ action: 'clear' });
    expect(parseGoalCommand('/goal edit ship importer fix')).toEqual({
      action: 'edit',
      goalText: 'ship importer fix',
    });
  });

  it('parses multiline goal objectives', () => {
    expect(parseGoalCommand('/goal edit ship importer\nwith tests')).toEqual({
      action: 'edit',
      goalText: 'ship importer\nwith tests',
    });
  });

  it('rejects malformed management commands', () => {
    expect(parseGoalCommand('/goal pause now')).toBeNull();
    expect(parseGoalCommand('/goal edit   ')).toBeNull();
  });

  it('detects valid goal commands only', () => {
    expect(isGoalSlashCommand('/goal')).toBe(true);
    expect(isGoalSlashCommand('/goal ship feature')).toBe(true);
    expect(isGoalSlashCommand('/goalie')).toBe(false);
    expect(isGoalSlashCommand('/goals')).toBe(false);
  });
});
