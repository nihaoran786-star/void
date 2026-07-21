import type {
  ShortDramaArtifact,
  ShortDramaArtifactType,
  ShortDramaChatIntakeApplyResult,
  ShortDramaChatIntakeInput,
  ShortDramaChatIntakeKind,
  ShortDramaChatIntakeRoute,
  ShortDramaChatIntakeRouteResult,
  ShortDramaProject,
  ShortDramaStage,
} from './ShortDramaTypes';

const SOURCE = 'short-drama-chat-intake' as const;

export function routeShortDramaChatIntake(
  project: ShortDramaProject,
  input: ShortDramaChatIntakeInput,
): ShortDramaChatIntakeRouteResult {
  const fileName = sanitizeFileName(input.fileName);
  const mimeType = input.mimeType?.toLowerCase() ?? '';
  const extension = getExtension(fileName);
  const instruction = input.userInstruction?.toLowerCase() ?? '';

  if (isScriptInput(extension, mimeType, input.text)) {
    return readyRoute({
      kind: 'scriptDocument',
      targetStage: 'script',
      manifestAction: 'updateScriptDocument',
      targetPath: projectPath(project, 'script.md'),
      recommendedManifestPatch: {
        action: 'updateScriptDocument',
        scriptDocument: {
          kind: 'markdown',
          content: '',
          filePath: projectPath(project, 'script.md'),
        },
      },
      confidence: input.text ? 0.92 : 0.78,
      reason: 'Left chat attachment looks like a short-drama script document.',
      summary: summarizeScriptInput(input.text),
      omittedContext: input.text ? ['rawAttachmentContent'] : [],
    });
  }

  if (isImageInput(extension, mimeType)) {
    const artifactType = inferAssetArtifactType(instruction, fileName);
    return readyRoute({
      kind: 'assetMedia',
      targetStage: 'assets',
      artifactType,
      manifestAction: 'createArtifactDraft',
      targetPath: projectPath(project, `media/assets/${assetFolderForType(artifactType)}/${fileName || 'asset-media'}`),
      recommendedManifestPatch: {
        action: 'createArtifactDraft',
        artifactDraft: {
          stage: 'assets',
          type: artifactType,
          title: titleFromFileName(fileName, 'Asset media'),
          summary: `${artifactType} asset draft from left chat attachment.`,
          status: 'pending',
          mediaReference: {
            mediaItemId: draftMediaItemId(project, fileName || 'asset-media'),
            kind: 'image',
            label: fileName || 'asset-media',
          },
        },
      },
      confidence: artifactType === 'image' ? 0.64 : 0.86,
      reason: 'Left chat attachment is an image, so it should become a global asset anchor or reference.',
      summary: `${artifactType} asset draft from left chat attachment.`,
      omittedContext: ['rawMediaBytes'],
    });
  }

  if (isVideoInput(extension, mimeType)) {
    const isPost = isPostInstruction(instruction, fileName);
    const targetStage: ShortDramaStage = isPost ? 'post' : 'video';
    const kind: ShortDramaChatIntakeKind = isPost ? 'postMedia' : 'videoMedia';
    const folder = isPost ? 'post' : 'video';
    return readyRoute({
      kind,
      targetStage,
      artifactType: 'video',
      manifestAction: 'attachMediaReference',
      targetPath: projectPath(project, `media/${folder}/${fileName || 'video-media'}`),
      recommendedManifestPatch: {
        action: 'attachMediaReference',
        targetStage,
        artifactType: 'video',
        mediaReference: {
          mediaItemId: draftMediaItemId(project, fileName || 'video-media'),
          kind: 'video',
          label: fileName || 'video-media',
        },
      },
      confidence: isPost ? 0.88 : 0.78,
      reason: isPost
        ? 'Left chat attachment is described as a final/post-production cut.'
        : 'Left chat attachment is a video clip for the video stage.',
      summary: `${targetStage} media reference from left chat attachment.`,
      omittedContext: ['rawMediaBytes'],
    });
  }

  return {
    status: 'unsupported',
    source: SOURCE,
    omittedContext: input.text ? ['rawAttachmentContent'] : ['rawMediaBytes'],
    error: {
      code: 'unsupported_runtime',
      message: 'Short drama chat intake only supports script text, image assets, and video media in this scaffold.',
    },
  };
}

export function applyShortDramaChatIntakeRoute(
  project: ShortDramaProject,
  routeResult: ShortDramaChatIntakeRouteResult,
): ShortDramaChatIntakeApplyResult {
  if (routeResult.status !== 'ready') {
    return {
      status: 'unsupported',
      source: SOURCE,
      error: routeResult.error,
    };
  }

  const { route } = routeResult;
  const patch = route.recommendedManifestPatch;

  if (patch.action === 'updateScriptDocument') {
    return {
      status: 'ready',
      source: SOURCE,
      project: {
        ...project,
        activeStage: 'script',
        scriptDocument: {
          ...patch.scriptDocument,
          filePath: normalizeTargetPath(patch.scriptDocument.filePath ?? route.targetPath),
        },
      },
    };
  }

  if (patch.action === 'createArtifactDraft') {
    const artifact = createArtifactDraft(project, route);
    return {
      status: 'ready',
      source: SOURCE,
      project: {
        ...project,
        activeStage: artifact.stage,
        artifacts: [...project.artifacts, artifact],
      },
      artifactId: artifact.id,
    };
  }

  if (patch.action === 'attachMediaReference') {
    const target = findMediaAttachmentTarget(project, route);
    if (!target) {
      return {
        status: 'error',
        source: SOURCE,
        error: {
          code: 'artifact_missing',
          message: 'No matching short drama artifact exists for this chat intake media route.',
        },
      };
    }

    return {
      status: 'ready',
      source: SOURCE,
      project: {
        ...project,
        activeStage: target.stage,
        activeEpisodeId: target.episodeId,
        artifacts: project.artifacts.map(artifact => artifact.id === target.id
          ? {
              ...artifact,
              status: 'revising',
              mediaReference: { ...patch.mediaReference },
              revisionCount: artifact.revisionCount + 1,
            }
          : artifact),
      },
      artifactId: target.id,
    };
  }

  return {
    status: 'error',
    source: SOURCE,
    error: {
      code: 'unsupported_runtime',
      message: 'Unsupported short drama chat intake manifest patch.',
    },
  };
}

function readyRoute(route: Omit<ShortDramaChatIntakeRoute, 'targetPath'> & { targetPath: string }) {
  return {
    status: 'ready' as const,
    source: SOURCE,
    route: {
      ...route,
      targetPath: normalizeTargetPath(route.targetPath),
    },
  };
}

function isScriptInput(extension: string, mimeType: string, text?: string) {
  return extension === 'md'
    || extension === 'markdown'
    || extension === 'txt'
    || mimeType === 'text/markdown'
    || mimeType === 'text/plain'
    || Boolean(text && countEpisodeHeadings(text) > 0);
}

function isImageInput(extension: string, mimeType: string) {
  return mimeType.startsWith('image/')
    || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension);
}

function isVideoInput(extension: string, mimeType: string) {
  return mimeType.startsWith('video/')
    || ['mp4', 'mov', 'webm', 'mkv'].includes(extension);
}

function inferAssetArtifactType(instruction: string, fileName: string): ShortDramaArtifactType {
  const text = `${instruction} ${fileName.toLowerCase()}`;
  // Check location first — more specific keywords, fewer false positives
  if (/(场景|地点|街头|宫墙|大殿|庭院|卧室|书房|花园|走廊|广场|城门|客栈|酒楼|山林|market|location|scene|street|palace|hall|garden|courtyard|room|corridor|square|gate|inn|forest|river|lake)/i.test(text)) {
    return 'location';
  }
  if (/(角色|女主|男主|人物|主角|女主角|男主角|配角|反派|character|hero|heroine|protagonist|antagonist|villain)/i.test(text)) {
    return 'character';
  }
  if (/(道具|物件|器物|武器|书信|令牌|卷轴|茶杯|烛台|prop|object|weapon|sword|letter|token|scroll|potion)/i.test(text)) {
    return 'prop';
  }
  // Fallback: use filename hints before defaulting
  if (/\b(scene|location|bg|background|env|environment)\b/i.test(fileName)) return 'location';
  if (/\b(char|character|role|portrait|face|avatar)\b/i.test(fileName)) return 'character';
  return 'prop';
}
function isPostInstruction(instruction: string, fileName: string) {
  const text = `${instruction} ${fileName.toLowerCase()}`;
  return /(\u540e\u671f|\u6210\u7247|\u6700\u7ec8|final|post|cut|export)/i.test(text);
}

function assetFolderForType(type: ShortDramaArtifactType) {
  if (type === 'character') {
    return 'characters';
  }
  if (type === 'location') {
    return 'locations';
  }
  if (type === 'prop') {
    return 'props';
  }
  return 'characters';
}

function summarizeScriptInput(text?: string) {
  const headingCount = countEpisodeHeadings(text ?? '');
  if (headingCount > 0) {
    return `${headingCount} episode headings detected from left chat script attachment.`;
  }
  return 'Script document from left chat attachment.';
}

function countEpisodeHeadings(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return text
    .split(/\r?\n/)
    .filter(line => /^#{1,2}\s*(\u7b2c\s*\d+\s*\u96c6|EP\s*\d+|Episode\s*\d+)/i.test(line.trim()))
    .length;
}

function projectPath(project: ShortDramaProject, relativePath: string) {
  void project;
  return `.void/short-drama/${relativePath}`;
}

function createArtifactDraft(project: ShortDramaProject, route: ShortDramaChatIntakeRoute): ShortDramaArtifact {
  const patch = route.recommendedManifestPatch;
  if (patch.action !== 'createArtifactDraft') {
    throw new Error('Expected createArtifactDraft patch.');
  }
  const artifactType = ['character', 'location', 'prop'].includes(patch.artifactDraft.type)
    ? patch.artifactDraft.type
    : 'character';

  const id = `chat-intake-asset-${draftIdFromLabel(patch.artifactDraft.mediaReference?.label ?? patch.artifactDraft.title)}`;
  return {
    id,
    handle: `ASSET-DRAFT-${String(project.artifacts.length + 1).padStart(3, '0')}`,
    displayName: patch.artifactDraft.title,
    episodeId: project.activeEpisodeId ?? project.episodes[0]?.id ?? 'episode-01',
    stage: patch.artifactDraft.stage,
    type: artifactType,
    title: patch.artifactDraft.title,
    summary: patch.artifactDraft.summary,
    agentRole: 'image',
    status: patch.artifactDraft.status,
    revisionCount: 0,
    attemptCount: 0,
    revisions: [],
    attempts: [],
    mediaReference: patch.artifactDraft.mediaReference,
  };
}

function findMediaAttachmentTarget(project: ShortDramaProject, route: ShortDramaChatIntakeRoute) {
  const targetStage = route.targetStage;
  const targetEpisodeId = project.activeEpisodeId ?? project.episodes[0]?.id;
  const stageArtifacts = project.artifacts.filter(artifact => artifact.stage === targetStage);
  const episodeStageArtifacts = stageArtifacts.filter(artifact => artifact.episodeId === targetEpisodeId);
  const candidates = episodeStageArtifacts.length > 0 ? episodeStageArtifacts : stageArtifacts;

  return candidates.find(artifact => artifact.type === route.artifactType && artifact.mediaReference?.kind === 'video')
    ?? candidates.find(artifact => artifact.type === route.artifactType)
    ?? candidates[0];
}

function draftMediaItemId(project: ShortDramaProject, fileName: string) {
  return `${project.projectId}-${fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-draft`;
}

function titleFromFileName(fileName: string, fallback: string) {
  if (!fileName) {
    return fallback;
  }

  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || fallback;
}

function draftIdFromLabel(label: string) {
  return label.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'media';
}

function normalizeTargetPath(path: string) {
  return path.replace(/\\/g, '/');
}

function sanitizeFileName(fileName?: string) {
  if (!fileName) {
    return '';
  }

  return fileName
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '-')
    ?? '';
}

function getExtension(fileName: string) {
  const match = /\.([^.]+)$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? '';
}
