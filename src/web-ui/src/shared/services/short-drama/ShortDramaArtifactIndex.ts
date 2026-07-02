import type {
  ShortDramaArtifact,
  ShortDramaArtifactIndexEntry,
  ShortDramaArtifactMediaMetadata,
  ShortDramaArtifactLocateResult,
  ShortDramaMediaArtifactIndexEntry,
  ShortDramaArtifactReadOptions,
  ShortDramaArtifactReadResult,
  ShortDramaArtifactResolveResult,
  ShortDramaArtifactSearchQuery,
  ShortDramaArtifactSearchResult,
  ShortDramaArtifactType,
  ShortDramaDerivedIndexIntegrityIssue,
  ShortDramaDerivedIndexIntegrityResult,
  ShortDramaMediaInventoryQuery,
  ShortDramaMediaInventoryResult,
  ShortDramaProject,
  ShortDramaSearchEntry,
  ShortDramaSearchIndexQuery,
  ShortDramaSearchIndexResult,
  ShortDramaScriptSegment,
  ShortDramaScriptSegmentReadOptions,
  ShortDramaScriptSegmentReadResult,
  ShortDramaScriptSegmentSearchQuery,
  ShortDramaScriptSegmentSearchResult,
  ShortDramaStage,
} from './ShortDramaTypes';

const ASSET_HANDLE_PREFIX: Partial<Record<ShortDramaArtifactType, string>> = {
  character: 'CHAR',
  location: 'LOC',
  prop: 'PROP',
};

const STAGE_HANDLE_PREFIX: Record<ShortDramaStage, string> = {
  script: 'SCRIPT',
  assets: 'ASSET',
  storyboards: 'SB',
  video: 'VID',
  post: 'POST',
};

const CHINESE_EPISODE_PREFIX = '\u7b2c';
const CHINESE_EPISODE_SUFFIX = '\u96c6';
const CHINESE_SCENE_SUFFIX = '\u573a';
const CHINESE_HEADING_SEPARATOR = '\uff1a';

interface ShortDramaMediaArtifactIndexOptions {
  includeEmpty?: boolean;
}

interface ShortDramaSearchIndexOptions {
  includeEmptyMedia?: boolean;
}

export function createShortDramaArtifactIndex(project: ShortDramaProject): ShortDramaArtifactIndexEntry[] {
  const episodeNumbers = new Map(project.episodes.map(episode => [episode.id, episode.number]));
  const typeOrdinals = new Map<string, number>();
  const stageEpisodeOrdinals = new Map<string, number>();

  const entries: ShortDramaArtifactIndexEntry[] = project.artifacts.map(artifact => {
    const episodeNumber = episodeNumbers.get(artifact.episodeId);
    const handle = artifact.handle ?? createArtifactHandle(artifact, episodeNumber, typeOrdinals, stageEpisodeOrdinals);
    const lastRevision = artifact.revisions.at(-1);
    const displayName = artifact.displayName ?? createArtifactDisplayName(artifact, handle, episodeNumber);
    const coordinates = inferArtifactCoordinates(artifact, handle, displayName);

    return {
      id: artifact.id,
      handle,
      previousHandles: artifact.previousHandles ?? [],
      displayName,
      stage: artifact.stage,
      artifactType: artifact.type,
      episodeId: artifact.episodeId,
      episodeNumber,
      sceneNumber: coordinates.sceneNumber,
      shotNumber: coordinates.shotNumber,
      shotNumbers: coordinates.shotNumbers,
      title: artifact.title,
      summary: artifact.summary,
      status: artifact.status,
      mediaKind: artifact.mediaReference?.kind,
      mediaItemId: artifact.mediaReference?.mediaItemId,
      hasMediaPreview: hasPreviewableMediaReference(artifact.mediaReference),
      hasPlayableMedia: isPlayableMediaReference(artifact.mediaReference),
      mediaDurationMs: artifact.mediaReference?.durationMs,
      dependsOn: artifact.dependsOn ?? [],
      updatedAt: lastRevision?.createdAt,
    };
  });
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));

  return entries.map(entry => {
    if (entry.sceneNumber && entry.shotNumber) {
      return entry;
    }

    const dependencyWithCoordinates = entry.dependsOn
      .map(dependencyId => entriesById.get(dependencyId))
      .find((dependency): dependency is ShortDramaArtifactIndexEntry => Boolean(dependency?.sceneNumber || dependency?.shotNumber));
    if (!dependencyWithCoordinates) {
      return entry;
    }

    return {
      ...entry,
      sceneNumber: entry.sceneNumber ?? dependencyWithCoordinates.sceneNumber,
      shotNumber: entry.shotNumber ?? dependencyWithCoordinates.shotNumber,
      shotNumbers: entry.shotNumbers ?? dependencyWithCoordinates.shotNumbers,
    };
  });
}

export function createShortDramaMediaArtifactIndex(
  project: ShortDramaProject,
  options: ShortDramaMediaArtifactIndexOptions = {},
): ShortDramaMediaArtifactIndexEntry[] {
  const artifactIndex = createShortDramaArtifactIndex(project);
  const entriesByArtifactId = new Map(artifactIndex.map(entry => [entry.id, entry]));

  return project.artifacts.flatMap(artifact => {
    const expectedMediaKind = getExpectedMediaKindForArtifact(artifact);
    if (!artifact.mediaReference && (!options.includeEmpty || !expectedMediaKind)) {
      return [];
    }

    const entry = entriesByArtifactId.get(artifact.id);
    if (!entry) {
      return [];
    }

    const mediaMetadata = artifact.mediaReference ? createMediaMetadata(artifact.mediaReference) : undefined;
    const mediaKind = mediaMetadata?.kind ?? expectedMediaKind;
    if (!mediaKind) {
      return [];
    }

    return [{
      artifactId: artifact.id,
      artifactHandle: entry.handle,
      displayName: entry.displayName,
      stage: artifact.stage,
      artifactType: artifact.type,
      episodeId: artifact.episodeId,
      episodeNumber: entry.episodeNumber,
      sceneNumber: entry.sceneNumber,
      shotNumber: entry.shotNumber,
      shotNumbers: entry.shotNumbers,
      status: artifact.status,
      mediaItemId: mediaMetadata?.mediaItemId,
      mediaKind,
      mediaStatus: getMediaInventoryStatus(artifact, mediaMetadata),
      mediaLabel: mediaMetadata?.label,
      previewAvailable: mediaMetadata?.previewAvailable ?? false,
      thumbnailAvailable: mediaMetadata?.thumbnailAvailable ?? false,
      playable: mediaMetadata?.playable ?? false,
      durationMs: mediaMetadata?.durationMs,
      scrollTargetId: getShortDramaArtifactDomId(artifact.id),
    }];
  });
}

export function listShortDramaMediaArtifacts(
  project: ShortDramaProject,
  query: ShortDramaMediaInventoryQuery = {},
): ShortDramaMediaInventoryResult {
  const limit = Math.max(1, query.limit ?? 50);
  const results = createShortDramaMediaArtifactIndex(project, { includeEmpty: query.includeEmpty })
    .filter(entry => query.stage ? entry.stage === query.stage : true)
    .filter(entry => query.episodeNumber ? entry.episodeNumber === query.episodeNumber : true)
    .filter(entry => query.sceneNumber ? entry.sceneNumber === query.sceneNumber : true)
    .filter(entry => query.shotNumber ? entryMatchesShot(entry, query.shotNumber) : true)
    .filter(entry => query.artifactType ? entry.artifactType === query.artifactType : true)
    .filter(entry => query.status ? entry.status === query.status : true)
    .filter(entry => query.mediaKind ? entry.mediaKind === query.mediaKind : true)
    .filter(entry => query.mediaItemId?.trim() ? normalizeReference(entry.mediaItemId ?? '') === normalizeReference(query.mediaItemId) : true)
    .filter(entry => query.mediaStatus ? entry.mediaStatus === query.mediaStatus : true)
    .filter(entry => typeof query.previewAvailable === 'boolean' ? entry.previewAvailable === query.previewAvailable : true)
    .filter(entry => typeof query.thumbnailAvailable === 'boolean' ? entry.thumbnailAvailable === query.thumbnailAvailable : true)
    .filter(entry => typeof query.playable === 'boolean' ? entry.playable === query.playable : true)
    .slice(0, limit);

  if (results.length === 0) {
    return { status: 'empty', source: 'media-artifact-index', query, reason: 'no_matches' };
  }

  return { status: 'ready', source: 'media-artifact-index', query, results };
}

export function createShortDramaScriptSegmentIndex(project: ShortDramaProject): ShortDramaScriptSegment[] {
  const content = project.scriptDocument?.content ?? createFallbackScriptMarkdown(project);
  const headings = collectScriptHeadings(content);
  const scriptArtifactIdsByEpisode = new Map<number, string[]>();
  project.artifacts
    .filter(artifact => artifact.stage === 'script')
    .forEach(artifact => {
      const episode = project.episodes.find(item => item.id === artifact.episodeId);
      if (!episode) {
        return;
      }
      const items = scriptArtifactIdsByEpisode.get(episode.number) ?? [];
      items.push(artifact.id);
      scriptArtifactIdsByEpisode.set(episode.number, items);
    });

  let currentEpisodeNumber: number | undefined;
  let currentSceneNumber: number | undefined;

  return headings.map((heading, index) => {
    const parsedEpisodeNumber = parseEpisodeNumberFromHeading(heading.text);
    const parsedSceneNumber = parseSceneNumberFromHeading(heading.text);
    if (parsedEpisodeNumber) {
      currentEpisodeNumber = parsedEpisodeNumber;
      currentSceneNumber = undefined;
    }
    if (parsedSceneNumber) {
      currentSceneNumber = parsedSceneNumber;
    }

    const episodeNumber = parsedEpisodeNumber ?? currentEpisodeNumber;
    const sceneNumber = parsedSceneNumber ?? currentSceneNumber;
    const endOffset = headings[index + 1]?.startOffset ?? content.length;
    const body = content.slice(heading.endOffset, endOffset).trim();

    return {
      id: createScriptSegmentId(episodeNumber, sceneNumber, index + 1),
      handle: createScriptSegmentHandle(episodeNumber, sceneNumber, index + 1),
      headingText: heading.text,
      headingLevel: heading.level,
      episodeNumber,
      sceneNumber,
      startOffset: heading.startOffset,
      endOffset,
      summary: createScriptSegmentSummary(body || heading.text),
      linkedArtifactIds: episodeNumber ? scriptArtifactIdsByEpisode.get(episodeNumber) ?? [] : [],
    };
  });
}

export function searchShortDramaScriptSegments(
  project: ShortDramaProject,
  query: ShortDramaScriptSegmentSearchQuery,
): ShortDramaScriptSegmentSearchResult {
  const limit = Math.max(1, query.limit ?? 8);
  const normalizedHandle = query.handle?.trim().toLowerCase();
  const results = createShortDramaScriptSegmentIndex(project)
    .filter(segment => normalizedHandle ? segment.handle.toLowerCase() === normalizedHandle : true)
    .filter(segment => query.episodeNumber ? segment.episodeNumber === query.episodeNumber : true)
    .filter(segment => query.sceneNumber ? segment.sceneNumber === query.sceneNumber : true)
    .filter(segment => query.text?.trim() ? scriptSegmentMatchesText(segment, query.text) : true)
    .slice(0, limit);

  if (results.length === 0) {
    return { status: 'empty', source: 'script-segment-index', query, reason: 'no_matches' };
  }

  return { status: 'ready', source: 'script-segment-index', query, results };
}

export function readShortDramaScriptSegment(
  project: ShortDramaProject,
  idOrHandle: string,
  options: ShortDramaScriptSegmentReadOptions = {},
): ShortDramaScriptSegmentReadResult {
  const normalized = idOrHandle.trim().toLowerCase();
  const segment = createShortDramaScriptSegmentIndex(project).find(item => (
    item.id.toLowerCase() === normalized || item.handle.toLowerCase() === normalized
  ));

  if (!segment) {
    return {
      status: 'not_found',
      source: 'script-segment-index',
      error: {
        code: 'script_segment_missing',
        message: `Short drama script segment was not found: ${idOrHandle}`,
      },
    };
  }

  const omittedContext: string[] = [];
  return {
    status: 'ready',
    source: 'script-segment-index',
    segment: {
      ...segment,
      summary: applyTokenBudgetWithOmission(segment.summary, options.tokenBudget, omittedContext, 'contentOverflow'),
    },
    omittedContext,
  };
}

export function createShortDramaSearchIndex(
  project: ShortDramaProject,
  options: ShortDramaSearchIndexOptions = {},
): ShortDramaSearchEntry[] {
  const artifacts = createShortDramaArtifactIndex(project);
  const mediaEntries = createShortDramaMediaArtifactIndex(project, { includeEmpty: options.includeEmptyMedia });
  const scriptSegments = createShortDramaScriptSegmentIndex(project);
  const artifactEntriesById = new Map(artifacts.map(entry => [entry.id, entry]));

  const artifactSearchEntries: ShortDramaSearchEntry[] = artifacts.map(entry => ({
    id: `artifact:${entry.id}`,
    kind: 'artifact',
    sourceId: entry.id,
    handle: entry.handle,
    title: entry.displayName,
    stage: entry.stage,
    artifactType: entry.artifactType,
    episodeId: entry.episodeId,
    episodeNumber: entry.episodeNumber,
    sceneNumber: entry.sceneNumber,
    shotNumber: entry.shotNumber,
    shotNumbers: entry.shotNumbers,
    text: [entry.displayName, entry.title, entry.summary].join(' '),
    tags: compactTags(entry.stage, entry.artifactType, entry.status, entry.mediaKind),
    status: entry.status,
    mediaKind: entry.mediaKind,
    hasMedia: Boolean(entry.mediaItemId),
    hasMediaPreview: entry.hasMediaPreview,
    hasPlayableMedia: entry.hasPlayableMedia,
    usedAssetIds: entry.dependsOn,
    updatedAt: entry.updatedAt,
  }));

  const mediaSearchEntries: ShortDramaSearchEntry[] = mediaEntries.map(entry => ({
    id: `media:${entry.artifactId}`,
    kind: 'media',
    sourceId: entry.artifactId,
    handle: entry.artifactHandle,
    title: entry.displayName,
    stage: entry.stage,
    artifactType: entry.artifactType,
    episodeId: entry.episodeId,
    episodeNumber: entry.episodeNumber,
    sceneNumber: entry.sceneNumber,
    shotNumber: entry.shotNumber,
    shotNumbers: entry.shotNumbers,
    text: [
      entry.displayName,
      artifactEntriesById.get(entry.artifactId)?.summary,
      entry.mediaLabel,
      entry.mediaKind,
      entry.mediaStatus,
      entry.mediaItemId,
    ].join(' '),
    tags: compactTags(entry.stage, entry.artifactType, entry.status, entry.mediaKind),
    status: entry.status,
    mediaKind: entry.mediaKind,
    mediaStatus: entry.mediaStatus,
    hasMedia: Boolean(entry.mediaItemId),
    hasMediaPreview: entry.previewAvailable,
    hasPlayableMedia: entry.playable,
    usedAssetIds: [],
    updatedAt: undefined,
  }));

  const scriptSearchEntries: ShortDramaSearchEntry[] = scriptSegments.map(segment => ({
    id: `script:${segment.id}`,
    kind: 'scriptSegment',
    sourceId: segment.id,
    handle: segment.handle,
    title: segment.headingText,
    stage: 'script',
    artifactType: 'script',
    episodeNumber: segment.episodeNumber,
    sceneNumber: segment.sceneNumber,
    text: [segment.headingText, segment.summary, segment.handle].join(' '),
    tags: ['script', 'scriptSegment'],
    hasMedia: false,
    hasMediaPreview: false,
    hasPlayableMedia: false,
    usedAssetIds: segment.linkedArtifactIds,
  }));

  return [...artifactSearchEntries, ...mediaSearchEntries, ...scriptSearchEntries];
}

export function searchShortDramaIndex(
  project: ShortDramaProject,
  query: ShortDramaSearchIndexQuery,
): ShortDramaSearchIndexResult {
  const limit = Math.max(1, query.limit ?? 12);
  const filtered = createShortDramaSearchIndex(project, { includeEmptyMedia: query.includeEmptyMedia })
    .filter(entry => query.kind ? entry.kind === query.kind : true)
    .filter(entry => query.stage ? entry.stage === query.stage : true)
    .filter(entry => query.episodeNumber ? entry.episodeNumber === query.episodeNumber : true)
    .filter(entry => query.sceneNumber ? entry.sceneNumber === query.sceneNumber : true)
    .filter(entry => query.shotNumber ? entryMatchesShot(entry, query.shotNumber) : true)
    .filter(entry => query.artifactType ? entry.artifactType === query.artifactType : true)
    .filter(entry => query.status ? entry.status === query.status : true)
    .filter(entry => query.mediaKind ? entry.mediaKind === query.mediaKind : true)
    .filter(entry => query.mediaStatus ? entry.mediaStatus === query.mediaStatus : true)
    .filter(entry => typeof query.hasMedia === 'boolean' ? entry.hasMedia === query.hasMedia : true)
    .filter(entry => typeof query.hasMediaPreview === 'boolean' ? entry.hasMediaPreview === query.hasMediaPreview : true)
    .filter(entry => typeof query.hasPlayableMedia === 'boolean' ? entry.hasPlayableMedia === query.hasPlayableMedia : true)
    .filter(entry => query.text?.trim() ? searchEntryMatchesText(entry, query.text) : true);
  const results = dedupeSearchEntries(filtered, query).slice(0, limit);

  if (results.length === 0) {
    return { status: 'empty', source: 'short-drama-search-index', query, reason: 'no_matches' };
  }

  return { status: 'ready', source: 'short-drama-search-index', query, results };
}

export function validateShortDramaDerivedIndexIntegrity(project: ShortDramaProject): ShortDramaDerivedIndexIntegrityResult {
  const artifactIndex = createShortDramaArtifactIndex(project);
  const mediaIndex = createShortDramaMediaArtifactIndex(project);
  const scriptSegments = createShortDramaScriptSegmentIndex(project);
  const episodeIds = new Set(project.episodes.map(episode => episode.id));
  const artifactIds = new Set(project.artifacts.map(artifact => artifact.id));
  const issues: ShortDramaDerivedIndexIntegrityIssue[] = [];

  project.artifacts.forEach(artifact => {
    if (!episodeIds.has(artifact.episodeId)) {
      issues.push({
        severity: 'error',
        code: 'episode_missing',
        artifactId: artifact.id,
        relatedId: artifact.episodeId,
        message: `Artifact ${artifact.id} references missing episode ${artifact.episodeId}.`,
      });
    }

    artifact.dependsOn?.forEach(dependencyId => {
      if (!artifactIds.has(dependencyId)) {
        issues.push({
          severity: 'error',
          code: 'dependency_missing',
          artifactId: artifact.id,
          relatedId: dependencyId,
          message: `Artifact ${artifact.id} depends on missing artifact ${dependencyId}.`,
        });
      }
    });
  });

  mediaIndex.forEach(entry => {
    if (!entry.previewAvailable) {
      issues.push({
        severity: 'warning',
        code: 'media_preview_missing',
        artifactId: entry.artifactId,
        relatedId: entry.mediaItemId,
        message: `Media ${entry.mediaItemId} for artifact ${entry.artifactId} has no preview.`,
      });
    }

    if (entry.mediaKind === 'video' && !entry.playable) {
      issues.push({
        severity: 'warning',
        code: 'media_playback_missing',
        artifactId: entry.artifactId,
        relatedId: entry.mediaItemId,
        message: `Video media ${entry.mediaItemId} for artifact ${entry.artifactId} is not playable.`,
      });
    }
  });

  const entriesByHandle = artifactIndex.reduce<Map<string, string[]>>((groups, entry) => {
    const ids = groups.get(entry.handle) ?? [];
    ids.push(entry.id);
    groups.set(entry.handle, ids);
    return groups;
  }, new Map());
  entriesByHandle.forEach((ids, handle) => {
    if (ids.length > 1) {
      ids.forEach(artifactId => {
        issues.push({
          severity: 'error',
          code: 'handle_conflict',
          artifactId,
          relatedId: handle,
          message: `Handle ${handle} resolves to multiple artifacts.`,
        });
      });
    }
  });

  const summary = {
    artifactCount: artifactIndex.length,
    mediaCount: mediaIndex.length,
    scriptSegmentCount: scriptSegments.length,
    issueCount: issues.length,
  };

  if (issues.length === 0) {
    return {
      status: 'ready',
      source: 'short-drama-derived-index-integrity',
      summary,
      issues: [],
    };
  }

  return {
    status: 'issues',
    source: 'short-drama-derived-index-integrity',
    summary,
    issues,
  };
}

export function resolveShortDramaArtifactReference(
  project: ShortDramaProject,
  idOrHandle: string,
): ShortDramaArtifactResolveResult {
  const needle = normalizeReference(idOrHandle);
  const index = createShortDramaArtifactIndex(project);
  const artifactsById = new Map(project.artifacts.map(artifact => [artifact.id, artifact]));

  const idMatch = project.artifacts.find(artifact => normalizeReference(artifact.id) === needle);
  if (idMatch) {
    const entry = index.find(item => item.id === idMatch.id);
    if (entry) {
      return { status: 'ready', source: 'id', artifact: idMatch, entry };
    }
  }

  const handleMatches = index.filter(entry => normalizeReference(entry.handle) === needle);
  if (handleMatches.length === 1) {
    return {
      status: 'ready',
      source: 'handle',
      artifact: artifactsById.get(handleMatches[0].id)!,
      entry: handleMatches[0],
    };
  }
  if (handleMatches.length > 1) {
    return createHandleConflict(handleMatches, idOrHandle);
  }

  const previousHandleMatches = index.filter(entry => entry.previousHandles.some(handle => normalizeReference(handle) === needle));
  if (previousHandleMatches.length === 1) {
    return {
      status: 'ready',
      source: 'previousHandle',
      artifact: artifactsById.get(previousHandleMatches[0].id)!,
      entry: previousHandleMatches[0],
    };
  }
  if (previousHandleMatches.length > 1) {
    return createHandleConflict(previousHandleMatches, idOrHandle);
  }

  return {
    status: 'not_found',
    source: 'artifact-index',
    error: { code: 'artifact_missing', message: `Short drama artifact was not found: ${idOrHandle}` },
  };
}

export function searchShortDramaArtifacts(
  project: ShortDramaProject,
  query: ShortDramaArtifactSearchQuery,
): ShortDramaArtifactSearchResult {
  const limit = Math.max(1, query.limit ?? 12);
  let results = createShortDramaArtifactIndex(project);

  if (query.handle?.trim()) {
    const resolved = resolveShortDramaArtifactReference(project, query.handle);
    if (resolved.status === 'ready') {
      results = [resolved.entry];
    } else if (resolved.status === 'conflict') {
      return { status: 'error', source: 'artifact-index', query, error: resolved.error };
    } else {
      results = [];
    }
  }

  results = results
    .filter(entry => query.stage ? entry.stage === query.stage : true)
    .filter(entry => query.episodeNumber ? entry.episodeNumber === query.episodeNumber : true)
    .filter(entry => query.sceneNumber ? entry.sceneNumber === query.sceneNumber : true)
    .filter(entry => query.shotNumber ? entryMatchesShot(entry, query.shotNumber) : true)
    .filter(entry => query.artifactType ? entry.artifactType === query.artifactType : true)
    .filter(entry => query.status ? entry.status === query.status : true)
    .filter(entry => query.mediaKind ? entry.mediaKind === query.mediaKind : true)
    .filter(entry => query.mediaItemId?.trim() ? normalizeReference(entry.mediaItemId ?? '') === normalizeReference(query.mediaItemId) : true)
    .filter(entry => typeof query.hasMedia === 'boolean' ? Boolean(entry.mediaItemId) === query.hasMedia : true)
    .filter(entry => typeof query.hasMediaPreview === 'boolean' ? entry.hasMediaPreview === query.hasMediaPreview : true)
    .filter(entry => typeof query.hasPlayableMedia === 'boolean' ? entry.hasPlayableMedia === query.hasPlayableMedia : true)
    .filter(entry => query.text?.trim() ? entryMatchesText(entry, query.text) : true)
    .slice(0, limit);

  if (results.length === 0) {
    return { status: 'empty', source: 'artifact-index', query, reason: 'no_matches' };
  }

  return { status: 'ready', source: 'artifact-index', query, results };
}

export function readShortDramaArtifact(
  project: ShortDramaProject,
  options: ShortDramaArtifactReadOptions,
): ShortDramaArtifactReadResult {
  const resolved = resolveShortDramaArtifactReference(project, options.idOrHandle);
  if (resolved.status !== 'ready') {
    return resolved;
  }

  const omittedContext: string[] = [];
  const summary = applyTokenBudget(`${resolved.entry.displayName}: ${resolved.artifact.summary}`, options.tokenBudget, omittedContext);
  const revisionSummary = options.includeRevisionSummary
    ? resolved.artifact.revisions.map(revision => `v${revision.version}: ${revision.summary}`)
    : undefined;

  if (!options.includeRevisionSummary && resolved.artifact.revisions.length) {
    omittedContext.push('revisionSummary');
  }
  if (!options.includeMediaMetadata && hasArtifactReadMediaMetadata(project, resolved.artifact)) {
    omittedContext.push('mediaMetadata');
  }
  const media = options.includeMediaMetadata
    ? createArtifactReadMediaMetadata(project, resolved.artifact)
    : undefined;

  return {
    status: 'ready',
    source: 'artifact-index',
    artifactId: resolved.artifact.id,
    entry: resolved.entry,
    summary,
    media,
    revisionSummary,
    omittedContext,
  };
}

export function locateShortDramaArtifact(
  project: ShortDramaProject,
  idOrHandle: string,
): ShortDramaArtifactLocateResult {
  const resolved = resolveShortDramaArtifactReference(project, idOrHandle);
  if (resolved.status !== 'ready') {
    return resolved;
  }

  return {
    status: 'ready',
    source: 'artifact-index',
    artifactId: resolved.artifact.id,
    handle: resolved.entry.handle,
    stage: resolved.artifact.stage,
    episodeId: resolved.artifact.episodeId,
    scrollTargetId: getShortDramaArtifactDomId(resolved.artifact.id),
  };
}

export function getShortDramaArtifactDomId(artifactId: string) {
  return `short-drama-artifact-${artifactId}`;
}

function createArtifactHandle(
  artifact: ShortDramaArtifact,
  episodeNumber: number | undefined,
  typeOrdinals: Map<string, number>,
  stageEpisodeOrdinals: Map<string, number>,
) {
  const assetPrefix = ASSET_HANDLE_PREFIX[artifact.type];
  if (assetPrefix) {
    return `${assetPrefix}-${nextOrdinal(typeOrdinals, assetPrefix)}`;
  }

  const episodePrefix = episodeNumber ? `EP${String(episodeNumber).padStart(2, '0')}` : 'EP00';
  if (artifact.stage === 'script') {
    return `${episodePrefix}-SCRIPT`;
  }

  const stagePrefix = STAGE_HANDLE_PREFIX[artifact.stage];
  return `${episodePrefix}-${stagePrefix}${nextOrdinal(stageEpisodeOrdinals, `${episodePrefix}-${stagePrefix}`)}`;
}

function createArtifactDisplayName(
  artifact: ShortDramaArtifact,
  handle: string,
  episodeNumber: number | undefined,
) {
  if (ASSET_HANDLE_PREFIX[artifact.type]) {
    return `${handle} ${artifact.title}`;
  }

  if (episodeNumber) {
    return `Episode ${episodeNumber} ${handle} ${artifact.title}`;
  }

  return `${handle} ${artifact.title}`;
}

function nextOrdinal(ordinals: Map<string, number>, key: string) {
  const next = (ordinals.get(key) ?? 0) + 1;
  ordinals.set(key, next);
  return String(next).padStart(2, '0');
}

function normalizeReference(value: string) {
  return value.trim().toLowerCase();
}

function entryMatchesText(entry: ShortDramaArtifactIndexEntry, text: string) {
  const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    entry.id,
    entry.handle,
    ...entry.previousHandles,
    entry.displayName,
    entry.title,
    entry.summary,
    entry.stage,
    entry.artifactType,
    entry.status,
    entry.mediaKind,
    entry.mediaItemId,
    entry.sceneNumber,
    entry.shotNumber,
    ...(entry.shotNumbers ?? []),
  ].join(' ').toLowerCase();

  return terms.every(term => haystack.includes(term));
}

function inferArtifactCoordinates(
  artifact: ShortDramaArtifact,
  handle: string,
  displayName: string,
): Pick<ShortDramaArtifactIndexEntry, 'sceneNumber' | 'shotNumber' | 'shotNumbers'> {
  const haystack = [
    handle,
    ...artifact.previousHandles ?? [],
    displayName,
    artifact.title,
    artifact.summary,
    artifact.mediaReference?.label,
  ].join(' ');
  const sceneNumber = firstNumberMatch(haystack, [
    /\bSC\s*0*(\d+)\b/i,
    /\bScene\s+0*(\d+)\b/i,
    /\u7b2c\s*0*(\d+)\s*\u573a/,
  ]);
  const shotNumbers = inferShotNumbers(haystack);

  return {
    sceneNumber,
    shotNumber: shotNumbers[0],
    shotNumbers: shotNumbers.length > 0 ? shotNumbers : undefined,
  };
}

function inferShotNumbers(text: string): number[] {
  const rangeMatch = text.match(/\b(?:SH|Shot|Shots)\s*0*(\d+)\s*[-–—]\s*0*(\d+)\b/i);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start && end - start <= 100) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }

  const single = firstNumberMatch(text, [
    /\bSH\s*0*(\d+)\b/i,
    /\bShot\s+0*(\d+)\b/i,
    /\u7b2c\s*0*(\d+)\s*\u955c/,
  ]);
  return single ? [single] : [];
}

function firstNumberMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}

function entryMatchesShot(
  entry: Pick<ShortDramaArtifactIndexEntry | ShortDramaMediaArtifactIndexEntry | ShortDramaSearchEntry, 'shotNumber' | 'shotNumbers'>,
  shotNumber: number,
) {
  return entry.shotNumber === shotNumber || Boolean(entry.shotNumbers?.includes(shotNumber));
}

function createMediaMetadata(mediaReference: ShortDramaArtifact['mediaReference']): ShortDramaArtifactMediaMetadata {
  if (!mediaReference) {
    throw new Error('mediaReference is required to create media metadata');
  }

  return {
    mediaItemId: mediaReference.mediaItemId,
    kind: mediaReference.kind,
    label: mediaReference.label,
    previewAvailable: hasPreviewableMediaReference(mediaReference),
    thumbnailAvailable: Boolean(mediaReference.thumbnailUrl ?? mediaReference.previewUrl ?? mediaReference.localPath ?? mediaReference.filePath),
    playable: isPlayableMediaReference(mediaReference),
    durationMs: mediaReference.durationMs,
    source: 'artifact-reference',
  };
}

function createArtifactReadMediaMetadata(
  project: ShortDramaProject,
  artifact: ShortDramaArtifact,
): ShortDramaArtifactMediaMetadata | undefined {
  if (artifact.mediaReference) {
    return createMediaMetadata(artifact.mediaReference);
  }

  const mediaEntry = createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
    .find(entry => entry.artifactId === artifact.id);
  if (!mediaEntry) {
    return undefined;
  }

  return {
    mediaItemId: mediaEntry.mediaItemId,
    kind: mediaEntry.mediaKind,
    label: mediaEntry.mediaLabel ?? artifact.title,
    mediaStatus: mediaEntry.mediaStatus,
    previewAvailable: mediaEntry.previewAvailable,
    thumbnailAvailable: mediaEntry.thumbnailAvailable,
    playable: mediaEntry.playable,
    durationMs: mediaEntry.durationMs,
    source: 'media-inventory',
  };
}

function hasArtifactReadMediaMetadata(project: ShortDramaProject, artifact: ShortDramaArtifact) {
  if (artifact.mediaReference) {
    return true;
  }

  return createShortDramaMediaArtifactIndex(project, { includeEmpty: true })
    .some(entry => entry.artifactId === artifact.id);
}

function getExpectedMediaKindForArtifact(artifact: ShortDramaArtifact): ShortDramaMediaArtifactIndexEntry['mediaKind'] | undefined {
  if (artifact.mediaReference) {
    return artifact.mediaReference.kind;
  }

  switch (artifact.type) {
    case 'character':
    case 'location':
    case 'prop':
    case 'image':
    case 'storyboard':
      return 'image';
    case 'video':
    case 'subtitle':
    case 'color':
      return 'video';
    case 'voice':
    case 'music':
    case 'sfx':
      return 'audio';
    case 'script':
    case 'scene-list':
      return undefined;
  }
}

function getMediaInventoryStatus(
  artifact: ShortDramaArtifact,
  mediaMetadata: ShortDramaArtifactMediaMetadata | undefined,
): ShortDramaMediaArtifactIndexEntry['mediaStatus'] {
  if (!mediaMetadata) {
    return 'empty';
  }

  if (artifact.status === 'unsupported') {
    return 'unsupported';
  }

  if (artifact.status === 'error') {
    return 'error';
  }

  if (!mediaMetadata.previewAvailable && !mediaMetadata.thumbnailAvailable && !mediaMetadata.playable) {
    return 'referencedMissingPreview';
  }

  return 'ready';
}

function hasPreviewableMediaReference(mediaReference: ShortDramaArtifact['mediaReference']) {
  return Boolean(mediaReference?.previewUrl ?? mediaReference?.localPath ?? mediaReference?.filePath);
}

function isPlayableMediaReference(mediaReference: ShortDramaArtifact['mediaReference']) {
  return mediaReference?.kind === 'video' && hasPreviewableMediaReference(mediaReference);
}

function createHandleConflict(matches: ShortDramaArtifactIndexEntry[], reference: string): Extract<ShortDramaArtifactResolveResult, { status: 'conflict' }> {
  return {
    status: 'conflict',
    source: 'artifact-index',
    error: { code: 'handle_conflict', message: `Short drama artifact reference is ambiguous: ${reference}` },
    matches,
  };
}

function applyTokenBudget(summary: string, tokenBudget: number | undefined, omittedContext: string[]) {
  return applyTokenBudgetWithOmission(summary, tokenBudget, omittedContext, 'summaryOverflow');
}

function applyTokenBudgetWithOmission(
  summary: string,
  tokenBudget: number | undefined,
  omittedContext: string[],
  omissionKey: string,
) {
  if (!tokenBudget || tokenBudget <= 0) {
    return summary;
  }

  const approximateCharacterBudget = tokenBudget * 4;
  if (summary.length <= approximateCharacterBudget) {
    return summary;
  }

  omittedContext.push(omissionKey);
  return `${summary.slice(0, Math.max(0, approximateCharacterBudget - 1)).trim()}...`;
}

function collectScriptHeadings(content: string) {
  const matches: Array<{ level: number; text: string; startOffset: number; endOffset: number }> = [];
  const regex = /^(#{1,6})\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    matches.push({
      level: match[1].length,
      text: match[2].trim(),
      startOffset: match.index,
      endOffset: match.index + match[0].length,
    });
  }
  return matches;
}

function parseEpisodeNumberFromHeading(title: string): number | undefined {
  const chineseMatch = new RegExp(
    `^${CHINESE_EPISODE_PREFIX}\\s*(\\d+)\\s*${CHINESE_EPISODE_SUFFIX}(?:\\s|$|[${CHINESE_HEADING_SEPARATOR}:.-])`,
  ).exec(title);
  if (chineseMatch) return Number(chineseMatch[1]);

  const epMatch = title.match(/^EP\s*0*(\d+)\b/i);
  if (epMatch) return Number(epMatch[1]);

  const episodeMatch = title.match(/^Episode\s+0*(\d+)\b/i);
  if (episodeMatch) return Number(episodeMatch[1]);

  const numericMatch = title.match(/^0*(\d+)\b/);
  if (numericMatch) return Number(numericMatch[1]);

  return undefined;
}

function parseSceneNumberFromHeading(title: string): number | undefined {
  const chineseMatch = new RegExp(
    `^${CHINESE_EPISODE_PREFIX}?\\s*(?:\\d+\\s*${CHINESE_EPISODE_SUFFIX}\\s*)?${CHINESE_EPISODE_PREFIX}?\\s*(\\d+)\\s*${CHINESE_SCENE_SUFFIX}(?:\\s|$|[${CHINESE_HEADING_SEPARATOR}:.-])`,
  ).exec(title);
  if (chineseMatch) return Number(chineseMatch[1]);

  const sceneMatch = title.match(/^Scene\s+0*(\d+)\b/i);
  if (sceneMatch) return Number(sceneMatch[1]);

  const scMatch = title.match(/^SC\s*0*(\d+)\b/i);
  if (scMatch) return Number(scMatch[1]);

  return undefined;
}

function createScriptSegmentId(episodeNumber: number | undefined, sceneNumber: number | undefined, ordinal: number) {
  if (episodeNumber && sceneNumber) {
    return `script-segment-episode-${String(episodeNumber).padStart(2, '0')}-scene-${String(sceneNumber).padStart(2, '0')}`;
  }
  if (episodeNumber) {
    return `script-segment-episode-${String(episodeNumber).padStart(2, '0')}`;
  }
  return `script-segment-${String(ordinal).padStart(2, '0')}`;
}

function createScriptSegmentHandle(episodeNumber: number | undefined, sceneNumber: number | undefined, ordinal: number) {
  if (episodeNumber && sceneNumber) {
    return `EP${String(episodeNumber).padStart(2, '0')}-SC${String(sceneNumber).padStart(2, '0')}`;
  }
  if (episodeNumber) {
    return `EP${String(episodeNumber).padStart(2, '0')}`;
  }
  return `SCRIPT-${String(ordinal).padStart(2, '0')}`;
}

function createScriptSegmentSummary(content: string) {
  return content.replace(/\s+/g, ' ').trim();
}

function scriptSegmentMatchesText(segment: ShortDramaScriptSegment, text: string) {
  const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    segment.id,
    segment.handle,
    segment.headingText,
    segment.summary,
    segment.episodeNumber,
    segment.sceneNumber,
  ].join(' ').toLowerCase();
  return terms.every(term => haystack.includes(term));
}

function searchEntryMatchesText(entry: ShortDramaSearchEntry, text: string) {
  const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    entry.id,
    entry.sourceId,
    entry.handle,
    entry.title,
    entry.text,
    ...entry.tags,
    entry.stage,
    entry.artifactType,
    entry.status,
    entry.mediaKind,
    entry.episodeNumber,
    entry.sceneNumber,
    entry.shotNumber,
    ...(entry.shotNumbers ?? []),
  ].join(' ').toLowerCase();
  return terms.every(term => haystack.includes(term));
}

function dedupeSearchEntries(entries: ShortDramaSearchEntry[], query: ShortDramaSearchIndexQuery) {
  const hasMediaFilter = Boolean(query.mediaKind)
    || typeof query.hasMedia === 'boolean'
    || typeof query.hasMediaPreview === 'boolean'
    || typeof query.hasPlayableMedia === 'boolean';
  if (!hasMediaFilter) {
    return entries;
  }

  const bySourceId = new Map<string, ShortDramaSearchEntry>();
  entries.forEach(entry => {
    const existing = bySourceId.get(entry.sourceId);
    if (!existing || (entry.kind === 'media' && existing.kind !== 'media')) {
      bySourceId.set(entry.sourceId, entry);
    }
  });
  return [...bySourceId.values()];
}

function compactTags(...values: Array<string | undefined>) {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function createFallbackScriptMarkdown(project: ShortDramaProject): string {
  return project.episodes.map(episode => {
    const scriptArtifact = project.artifacts.find(artifact => (
      artifact.stage === 'script' && artifact.episodeId === episode.id
    ));
    return `# ${CHINESE_EPISODE_PREFIX}${episode.number}${CHINESE_EPISODE_SUFFIX}\n\n${scriptArtifact?.summary || episode.summary || ''}`;
  }).join('\n\n');
}
