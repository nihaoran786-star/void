import { describe, expect, it, vi } from 'vitest';
import {
  TeamAuthoringError,
} from '../TeamAuthoringGateway';
import { DesktopTeamPackagePicker } from './DesktopTeamPackagePicker';

describe('DesktopTeamPackagePicker', () => {
  it('fails closed in a browser without opening a file dialog', async () => {
    const pickFile = vi.fn(async () => 'D:/unsafe/team.void-team.json');
    const picker = new DesktopTeamPackagePicker(() => false, pickFile);

    await expect(picker.pickPackage()).rejects.toMatchObject<TeamAuthoringError>({
      code: 'unsupported_transport',
    });
    expect(pickFile).not.toHaveBeenCalled();
  });

  it('returns the selected desktop package path', async () => {
    const picker = new DesktopTeamPackagePicker(
      () => true,
      async () => 'D:/teams/software.void-team.json',
    );

    await expect(picker.pickPackage())
      .resolves.toBe('D:/teams/software.void-team.json');
  });
});
