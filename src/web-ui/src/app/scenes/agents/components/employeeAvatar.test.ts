import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_AVATAR_COUNT,
  resolveEmployeeAvatarIndex,
  resolveEmployeeAvatarUrl,
} from './employeeAvatar';

describe('employeeAvatar', () => {
  it('assigns stable portraits to known built-in employee identities', () => {
    expect(resolveEmployeeAvatarUrl('agentic'))
      .toBe('/agent-avatars/employee-01.webp');
    expect(resolveEmployeeAvatarUrl('mode::ComputerUse'))
      .toBe('/agent-avatars/employee-04.webp');
    expect(resolveEmployeeAvatarUrl('subagent::ReviewFixer'))
      .toBe('/agent-avatars/employee-24.webp');
  });

  it('hashes user and project identities deterministically into the shared portrait library', () => {
    const identity = 'user::void::my-finance-expert';
    const first = resolveEmployeeAvatarIndex(identity);
    const second = resolveEmployeeAvatarIndex(identity);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(EMPLOYEE_AVATAR_COUNT);
    expect(resolveEmployeeAvatarUrl(identity))
      .toMatch(/^\/agent-avatars\/employee-\d{2}\.webp$/);
    expect(resolveEmployeeAvatarUrl('project::void::my-finance-expert'))
      .not.toBe(resolveEmployeeAvatarUrl(identity));
  });

  it('keeps an empty identity inside the same deterministic library', () => {
    expect(resolveEmployeeAvatarUrl('')).toBe(resolveEmployeeAvatarUrl(''));
  });
});
