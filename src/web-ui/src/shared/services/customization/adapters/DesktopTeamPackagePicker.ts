import { isTauriRuntime } from '@/infrastructure/runtime';
import {
  TeamAuthoringError,
} from '../TeamAuthoringGateway';
import type { TeamPackagePicker } from '../TeamPackagePicker';

export type TeamPackageFilePicker = () => Promise<string | null>;

async function openTeamPackageDialog(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{
      name: 'Void Team',
      extensions: ['json'],
    }],
  });
  return typeof selected === 'string' ? selected : null;
}

/**
 * Desktop-only package picker.
 *
 * The page consumes this adapter through TeamPackagePicker and never imports
 * Tauri dialog APIs directly.
 */
export class DesktopTeamPackagePicker implements TeamPackagePicker {
  constructor(
    private readonly detectTauriRuntime: () => boolean = isTauriRuntime,
    private readonly pickFile: TeamPackageFilePicker = openTeamPackageDialog,
  ) {}

  async pickPackage(): Promise<string | null> {
    if (!this.detectTauriRuntime()) {
      throw new TeamAuthoringError(
        'unsupported_transport',
        'Team package selection is only available in the desktop app',
      );
    }
    return this.pickFile();
  }
}

export const desktopTeamPackagePicker = new DesktopTeamPackagePicker();
