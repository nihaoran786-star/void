import { describe, expect, it, vi } from 'vitest';

import {
  createShortDramaManifestLibraryService,
  createShortDramaStaticProject,
} from '@/shared/services/short-drama/ShortDramaProjectViewModel';
import { wasShortDramaArtifactRefinedOnCanvas } from './shortDramaCanvasRefBridge';
import type { ShortDramaProject } from '@/shared/services/short-drama/ShortDramaTypes';
import {
  canSendCanvasPictureBackToShortDrama,
  sendCanvasPictureBackToShortDrama,
} from './shortDramaCanvasWriteBack';

const WORKSPACE = 'C:/work';
const PICTURE = {
  workspacePath: WORKSPACE,
  relativePath: 'media/generated/batch-refined/image-1.png',
};

function characterArtifact(project: ShortDramaProject) {
  return project.artifacts.find(artifact => artifact.type === 'character')!;
}

function harness(overrides: {
  project?: ShortDramaProject;
  saveStatus?: string;
} = {}) {
  const project = overrides.project ?? createShortDramaStaticProject();
  const saved: ShortDramaProject[] = [];
  const changed: string[] = [];
  return {
    project,
    saved,
    changed,
    deps: {
      readProject: vi.fn(async () => project),
      saveProject: vi.fn(async (next: ShortDramaProject) => {
        saved.push(next);
        return { status: overrides.saveStatus ?? 'ready' };
      }),
      notifyProjectChanged: (workspacePath: string) => { changed.push(workspacePath); },
    },
  };
}

function request(project: ShortDramaProject, overrides: Record<string, unknown> = {}) {
  const artifact = characterArtifact(project);
  return {
    domainRef: {
      moduleId: 'short-drama',
      kind: artifact.type,
      id: artifact.id,
      role: 'refine',
    },
    mediaRef: PICTURE,
    canvasNodeId: 'node-7',
    workspacePath: WORKSPACE,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

describe('short drama canvas write-back', () => {
  it('records the refinement, asks for review, and tells the panel to reload', async () => {
    const { project, deps, saved, changed } = harness();
    const artifact = characterArtifact(project);

    const result = await sendCanvasPictureBackToShortDrama(request(project), deps);

    expect(result).toMatchObject({ status: 'sent', artifactId: artifact.id, alreadyRecorded: false });
    expect(saved).toHaveLength(1);
    const updated = saved[0].artifacts.find(item => item.id === artifact.id)!;
    expect(updated.status).toBe('reviewing');
    expect(updated.mediaReference?.relativePath).toBe(PICTURE.relativePath);
    expect(updated.mediaReference?.localPath).toBe(`${WORKSPACE}/${PICTURE.relativePath}`);
    // A generated picture keeps the identity its own job gave it, so the same
    // file arriving by any other route lands on this revision, not a twin.
    expect(updated.mediaReference?.mediaItemId).toBe('batch-refined-1');
    // Never a preview URL: those are convertFileSrc products the webview
    // refuses, and the card resolves the file itself.
    expect(updated.mediaReference?.previewUrl).toBeUndefined();
    expect(updated.mediaReference?.thumbnailUrl).toBeUndefined();
    expect(changed).toEqual([WORKSPACE]);
  });

  it('never grows the attempt ledger', async () => {
    const { project, deps, saved } = harness();
    const artifact = characterArtifact(project);

    await sendCanvasPictureBackToShortDrama(request(project), deps);

    const updated = saved[0].artifacts.find(item => item.id === artifact.id)!;
    expect(updated.attempts).toEqual(artifact.attempts);
    expect(updated.attemptCount).toBe(artifact.attemptCount);
  });

  it('treats a second press on the same picture as the repeat it is', async () => {
    const { project, deps, saved, changed } = harness();
    const first = await sendCanvasPictureBackToShortDrama(request(project), deps);
    // The reader still returns the ORIGINAL project in this harness, so the
    // second press is only stopped by the derived operation id if it is truly
    // derived. Feed the saved project back to make the check honest.
    const second = await sendCanvasPictureBackToShortDrama(request(project), {
      ...deps,
      readProject: vi.fn(async () => saved[0]),
    });

    expect(first).toMatchObject({ status: 'sent', alreadyRecorded: false });
    expect(second).toMatchObject({ status: 'sent', alreadyRecorded: true });
    expect(saved).toHaveLength(1);
    expect(changed).toEqual([WORKSPACE]);
  });

  it('lets a different picture through', async () => {
    const { project, deps, saved } = harness();
    const artifact = characterArtifact(project);
    await sendCanvasPictureBackToShortDrama(request(project), deps);

    const second = await sendCanvasPictureBackToShortDrama(
      request(project, {
        mediaRef: {
          workspacePath: WORKSPACE,
          relativePath: 'media/generated/batch-refined/image-2.png',
        },
      }),
      { ...deps, readProject: vi.fn(async () => saved[0]) },
    );

    expect(second).toMatchObject({ status: 'sent', alreadyRecorded: false });
    expect(saved).toHaveLength(2);
    const updated = saved[1].artifacts.find(item => item.id === artifact.id)!;
    expect(updated.revisions.filter(revision => revision.sourceCanvasNodeId === 'node-7'))
      .toHaveLength(2);
  });

  it('refuses a card whose picture lives in another workspace', async () => {
    const { project, deps, saved } = harness();

    const result = await sendCanvasPictureBackToShortDrama(
      request(project, {
        mediaRef: { workspacePath: 'D:/elsewhere', relativePath: PICTURE.relativePath },
      }),
      deps,
    );

    expect(result).toEqual({ status: 'refused', reason: 'foreign-workspace' });
    expect(deps.readProject).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it('refuses a remote workspace', async () => {
    const { project, deps, saved } = harness();

    const result = await sendCanvasPictureBackToShortDrama(
      request(project, { backend: 'remote' }),
      deps,
    );

    expect(result).toEqual({ status: 'refused', reason: 'remote-workspace' });
    expect(saved).toHaveLength(0);
  });

  it('refuses a picture with no usable path', async () => {
    const { project, deps, saved } = harness();

    const result = await sendCanvasPictureBackToShortDrama(
      request(project, {
        mediaRef: { workspacePath: WORKSPACE, relativePath: '../outside/image.png' },
      }),
      deps,
    );

    expect(result).toEqual({ status: 'refused', reason: 'unusable-picture' });
    expect(saved).toHaveLength(0);
  });

  it('refuses a picture that is not a picture', async () => {
    const { project, deps } = harness();

    const result = await sendCanvasPictureBackToShortDrama(
      request(project, {
        mediaRef: { workspacePath: WORKSPACE, relativePath: 'media/generated/b/clip-1.mp4' },
      }),
      deps,
    );

    expect(result).toEqual({ status: 'refused', reason: 'unusable-picture' });
  });

  it('refuses when the asset is gone', async () => {
    const { project, deps, saved } = harness();

    const result = await sendCanvasPictureBackToShortDrama(
      request(project, {
        domainRef: {
          moduleId: 'short-drama',
          kind: 'character',
          id: 'artifact-that-was-deleted',
          role: 'refine',
        },
      }),
      deps,
    );

    expect(result).toEqual({ status: 'refused', reason: 'asset-missing' });
    expect(saved).toHaveLength(0);
  });

  it('refuses when the id now names a different kind of asset', async () => {
    const { project, deps, saved } = harness();
    const artifact = characterArtifact(project);

    const result = await sendCanvasPictureBackToShortDrama(
      request(project, {
        domainRef: {
          moduleId: 'short-drama',
          kind: 'storyboard',
          id: artifact.id,
          role: 'refine',
        },
      }),
      deps,
    );

    expect(result).toEqual({ status: 'refused', reason: 'asset-missing' });
    expect(saved).toHaveLength(0);
  });

  it('refuses when the project cannot be read', async () => {
    const { project, deps } = harness();

    const result = await sendCanvasPictureBackToShortDrama(request(project), {
      ...deps,
      readProject: vi.fn(async () => undefined),
    });

    expect(result).toEqual({ status: 'refused', reason: 'project-unreadable' });
  });

  it('says so when the save fails, and does not claim the panel changed', async () => {
    const { project, deps, changed } = harness({ saveStatus: 'error' });

    const result = await sendCanvasPictureBackToShortDrama(request(project), deps);

    expect(result).toEqual({ status: 'refused', reason: 'save-failed' });
    expect(changed).toEqual([]);
  });

  it('answers the card up front about whether a press could work', () => {
    expect(canSendCanvasPictureBackToShortDrama(PICTURE, WORKSPACE)).toBe(true);
    expect(canSendCanvasPictureBackToShortDrama(PICTURE, WORKSPACE, 'remote')).toBe(false);
    expect(canSendCanvasPictureBackToShortDrama(PICTURE, 'D:/elsewhere')).toBe(false);
    expect(canSendCanvasPictureBackToShortDrama(undefined, WORKSPACE)).toBe(false);
  });
});

describe('short drama canvas write-back, through a real manifest', () => {
  it('survives the round trip, and the panel can then say where the picture came from', async () => {
    const files = new Map<string, string>();
    const adapter = {
      kind: 'local' as const,
      async read(key: string) { return files.get(key); },
      async write(key: string, value: string) { files.set(key, value); },
    };
    const library = createShortDramaManifestLibraryService(adapter, 'static_short_drama_001');
    const project = createShortDramaStaticProject();
    const artifact = characterArtifact(project);

    const result = await sendCanvasPictureBackToShortDrama(request(project), {
      readProject: async () => project,
      saveProject: async next => library.saveProject(next),
      notifyProjectChanged: () => undefined,
    });
    expect(result.status).toBe('sent');

    // Read it back the way the panel does. The two additive revision fields
    // are what the origin note is inferred from, so they have to survive the
    // manifest — and the manifest version must not have moved to carry them.
    const reloaded = await library.loadProject(WORKSPACE);
    expect(reloaded.status).toBe('ready');
    const stored = reloaded.status === 'ready'
      ? reloaded.project.artifacts.find(item => item.id === artifact.id)!
      : undefined;
    expect(stored?.status).toBe('reviewing');
    expect(wasShortDramaArtifactRefinedOnCanvas(stored!)).toBe(true);
    const latest = stored!.revisions[stored!.revisions.length - 1];
    expect(latest.sourceCanvasNodeId).toBe('node-7');
    expect(latest.sourceOperationId).toContain(artifact.id);
    expect(JSON.parse(files.get([...files.keys()].find(key => key.includes('manifest'))!)!)
      .manifestVersion).toBe(1);
  });
});
