import type {
  ShortDramaArtifact,
  ShortDramaLibraryService,
  ShortDramaLibraryState,
  ShortDramaProductionPlan,
  ShortDramaProject,
} from './ShortDramaTypes';

const now = 1_783_000_000_000;
const DEFAULT_EPISODE_COUNT = 10;
const STATIC_VIDEO_PREVIEW_URL = '/short-drama-static/final-preview.mp4';
const STATIC_ALIAS_LEAD_CHARACTER = '\u5973\u4e3b\u89d2\u8272\u56fe';
const STATIC_ALIAS_EPISODE_02_STREET_IMAGE = '\u7b2c\u4e8c\u96c6\u8857\u5934\u90a3\u5f20\u56fe';
const STATIC_ALIAS_EPISODE_01_FINAL_POST = '\u540e\u671f\u7b2c\u4e00\u96c6\u6210\u7247';

function svgDataUri(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const STATIC_CHARACTER_PREVIEW_URL = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#16212f"/><stop offset="1" stop-color="#315f65"/></linearGradient></defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <circle cx="472" cy="176" r="62" fill="#d8c4a1"/>
  <path d="M314 475c28-120 82-184 162-184s136 64 170 184z" fill="#8e1f2f"/>
  <path d="M406 145c42-54 112-54 148 2-14-82-136-84-148-2z" fill="#1e293b"/>
  <path d="M248 454h456" stroke="#e7d8b5" stroke-width="5" opacity=".5"/>
  <text x="48" y="78" fill="#edf2f7" font-family="Arial, sans-serif" font-size="34" font-weight="700">CHAR-001</text>
  <text x="48" y="124" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="22">Character reference</text>
</svg>`);

const STATIC_STORYBOARD_PREVIEW_URL = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#172033"/>
  <rect x="76" y="72" width="808" height="396" rx="12" fill="#223047" stroke="#d6b56d" stroke-width="5"/>
  <path d="M124 390c150-138 254-160 366-62 82 72 172 50 302-70" fill="none" stroke="#d6b56d" stroke-width="10" opacity=".75"/>
  <circle cx="248" cy="220" r="42" fill="#e2c48f"/>
  <path d="M578 160l154 92-154 92z" fill="#b45309"/>
  <text x="112" y="126" fill="#f8fafc" font-family="Arial, sans-serif" font-size="34" font-weight="700">SC01-SH01</text>
  <text x="112" y="168" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="20">Storyboard still</text>
</svg>`);

const STATIC_VIDEO_POSTER_URL = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
  <defs><linearGradient id="videoBg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>
  <rect width="960" height="540" fill="url(#videoBg)"/>
  <rect x="84" y="76" width="792" height="388" rx="18" fill="#0f172a" opacity=".44" stroke="#cbd5e1" stroke-width="3"/>
  <circle cx="480" cy="270" r="72" fill="#f8fafc" opacity=".9"/>
  <path d="M460 228l74 42-74 42z" fill="#111827"/>
  <text x="108" y="126" fill="#f8fafc" font-family="Arial, sans-serif" font-size="34" font-weight="700">VID-001</text>
  <text x="108" y="168" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="20">Playable preview</text>
</svg>`);

export const SHORT_DRAMA_STATIC_PROJECT_FIXTURE_VERSION = `static-${DEFAULT_EPISODE_COUNT}-episodes-manifest-backfill`;

export interface ShortDramaStaticProjectOptions {
  episodeCount?: number;
}

export function getShortDramaStaticProjectFixtureVersion() {
  return SHORT_DRAMA_STATIC_PROJECT_FIXTURE_VERSION;
}

function attempt(id: string, status: ShortDramaArtifact['attempts'][number]['status']) {
  return { id, status, createdAt: now };
}

function revision(id: string, version: number, summary: string, mediaItemId?: string) {
  return { id, version, createdAt: now, summary, mediaItemId };
}

function formatEpisodeId(number: number) {
  return `episode-${String(number).padStart(2, '0')}`;
}

function createEpisodeNumbers(episodeCount = DEFAULT_EPISODE_COUNT) {
  const count = Math.max(1, Math.floor(episodeCount));
  return Array.from({ length: count }, (_, index) => index + 1);
}

function createProductionPlan(episodeNumbers: number[]): ShortDramaProductionPlan {
  const episodeIds = episodeNumbers.map(formatEpisodeId);
  const lastEpisodeNumber = episodeNumbers.at(-1) ?? DEFAULT_EPISODE_COUNT;
  return {
    status: 'ready',
    mode: 'semiAutomatic',
    goal: `Produce a ${lastEpisodeNumber}-episode palace suspense micro drama with consistent characters and locations.`,
    episodeRange: `Episode 01-${String(lastEpisodeNumber).padStart(2, '0')}`,
    estimatedMinutes: Math.max(180, lastEpisodeNumber * 18),
    estimatedCostLabel: '$34.00 est.',
    steps: [
      {
        id: 'plan-script',
        stage: 'script',
        episodeIds,
        status: 'ready',
        summary: 'Lock episode beats, scene summaries, and dialogue direction.',
        estimatedMinutes: 28,
        estimatedCostLabel: '$2.00 est.',
      },
      {
        id: 'plan-assets',
        stage: 'assets',
        episodeIds,
        status: 'running',
        summary: 'Create reusable character, location, prop, and key visual references.',
        estimatedMinutes: 55,
        estimatedCostLabel: '$8.00 est.',
      },
      {
        id: 'plan-storyboards',
        stage: 'storyboards',
        episodeIds,
        status: 'ready',
        summary: 'Convert scenes into shot cards and camera prompts.',
        estimatedMinutes: 42,
        estimatedCostLabel: '$5.00 est.',
      },
      {
        id: 'plan-video',
        stage: 'video',
        episodeIds,
        status: 'pending',
        summary: 'Render selected storyboard shots into video clips.',
        estimatedMinutes: 48,
        estimatedCostLabel: '$18.00 est.',
      },
      {
        id: 'plan-post',
        stage: 'post',
        episodeIds,
        status: 'pending',
        summary: 'Assemble voice, music, subtitles, color, and final continuity pass.',
        estimatedMinutes: 7,
        estimatedCostLabel: '$1.00 est.',
      },
    ],
  };
}

const artifacts: ShortDramaArtifact[] = [
  {
    id: 'episode-01-script',
    episodeId: 'episode-01',
    stage: 'script',
    type: 'script',
    title: 'Episode 01 script polish',
    summary: 'A displaced guard wakes under lantern light as the imperial banquet turns hostile.',
    agentRole: 'director',
    status: 'ready',
    revisionCount: 1,
    attemptCount: 1,
    attempts: [attempt('attempt-script-01', 'completed')],
    revisions: [revision('revision-script-01', 1, 'Locked opening beats and hidden letter turn.')],
    subagentSessionId: 'subagent-director-episode-01',
    parentSessionId: 'parent-main-session',
    parentToolCallId: 'tool-script-episode-01',
  },
  {
    id: 'episode-02-script',
    episodeId: 'episode-02',
    stage: 'script',
    type: 'script',
    title: 'Episode 02 script outline',
    summary: 'The palace glow falls away and the city becomes a harder place to survive.',
    agentRole: 'director',
    status: 'reviewing',
    revisionCount: 1,
    attemptCount: 2,
    attempts: [attempt('attempt-script-02-a', 'completed'), attempt('attempt-script-02-b', 'running')],
    revisions: [revision('revision-script-02', 1, 'Drafted exile sequence and new antagonist clue.')],
  },
  {
    id: 'episode-01-character-guard',
    episodeId: 'episode-01',
    stage: 'assets',
    type: 'character',
    title: 'Chai Yong character reference',
    summary: `Young guard with a modern posture trapped in a ceremonial court role. ${STATIC_ALIAS_LEAD_CHARACTER} visual anchor for continuity.`,
    agentRole: 'image',
    status: 'ready',
    revisionCount: 2,
    attemptCount: 3,
    attempts: [attempt('attempt-character-guard', 'completed')],
    revisions: [revision('revision-character-guard', 2, 'Matched hairstyle and robe continuity.', 'media-image-hero')],
    subagentSessionId: 'subagent-image-character-guard',
    parentSessionId: 'parent-main-session',
    parentToolCallId: 'tool-image-character-guard',
    mediaReference: {
      mediaItemId: 'media-image-hero',
      kind: 'image',
      label: 'Character still',
      previewUrl: STATIC_CHARACTER_PREVIEW_URL,
      thumbnailUrl: STATIC_CHARACTER_PREVIEW_URL,
    },
    dependsOn: ['episode-01-script'],
  },
  {
    id: 'episode-01-prop-letter',
    episodeId: 'episode-01',
    stage: 'assets',
    type: 'prop',
    title: 'Half-hidden letter prop',
    summary: 'Folded paper clue that must remain legible only in close shot.',
    agentRole: 'image',
    status: 'pending',
    revisionCount: 0,
    attemptCount: 0,
    attempts: [],
    revisions: [],
    dependsOn: ['episode-01-script'],
  },
  {
    id: 'episode-02-location-street',
    episodeId: 'episode-02',
    stage: 'assets',
    type: 'location',
    title: 'Outer palace road location',
    summary: `Cold night street outside the palace wall. ${STATIC_ALIAS_EPISODE_02_STREET_IMAGE} anchor for location continuity.`,
    agentRole: 'image',
    status: 'generating',
    revisionCount: 0,
    attemptCount: 1,
    attempts: [attempt('attempt-location-street', 'running')],
    revisions: [],
    dependsOn: ['episode-02-script'],
  },
  {
    id: 'episode-01-storyboard-01',
    episodeId: 'episode-01',
    stage: 'storyboards',
    type: 'storyboard',
    title: 'Scene 01 shots 01-03',
    summary: 'A centered banquet hall composition gives way to a sudden diagonal threat.',
    agentRole: 'director',
    status: 'ready',
    revisionCount: 1,
    attemptCount: 1,
    attempts: [attempt('attempt-board-01', 'completed')],
    revisions: [revision('revision-board-01', 1, 'Wide to handheld break camera plan.')],
    subagentSessionId: 'subagent-storyboard-episode-01',
    parentSessionId: 'parent-main-session',
    parentToolCallId: 'tool-storyboard-episode-01',
    mediaReference: {
      mediaItemId: 'media-storyboard-01',
      kind: 'image',
      label: 'Storyboard still',
      previewUrl: STATIC_STORYBOARD_PREVIEW_URL,
      thumbnailUrl: STATIC_STORYBOARD_PREVIEW_URL,
    },
    dependsOn: ['episode-01-script', 'episode-01-character-guard'],
    references: {
      scriptSegmentIds: ['script-segment-episode-01'],
      characterAssetIds: ['episode-01-character-guard'],
      propAssetIds: ['episode-01-prop-letter'],
    },
  },
  {
    id: 'episode-02-storyboard-01',
    episodeId: 'episode-02',
    stage: 'storyboards',
    type: 'storyboard',
    title: 'Scene 04 shots 01-02',
    summary: 'Cold exterior beat after the escape.',
    agentRole: 'director',
    status: 'stale',
    statusReason: 'Episode 02 script is still under review.',
    revisionCount: 1,
    attemptCount: 1,
    attempts: [attempt('attempt-board-02', 'completed')],
    revisions: [revision('revision-board-02', 1, 'Exterior transition draft.')],
    dependsOn: ['episode-02-script'],
    references: {
      scriptSegmentIds: ['script-segment-episode-02'],
      locationAssetIds: ['episode-02-location-street'],
    },
  },
  {
    id: 'episode-01-video-01',
    episodeId: 'episode-01',
    stage: 'video',
    type: 'video',
    title: 'Shot 01-03 video render',
    summary: 'Slow push along the ceremonial centerline before a sharp handheld break.',
    agentRole: 'video',
    status: 'ready',
    revisionCount: 1,
    attemptCount: 1,
    attempts: [attempt('attempt-video-01', 'completed')],
    revisions: [revision('revision-video-01', 1, 'Approved 12 second clip.', 'media-video-01')],
    subagentSessionId: 'subagent-video-episode-01',
    parentSessionId: 'parent-main-session',
    parentToolCallId: 'tool-video-episode-01',
    mediaReference: {
      mediaItemId: 'media-video-01',
      kind: 'video',
      label: 'Video clip',
      previewUrl: STATIC_VIDEO_PREVIEW_URL,
      thumbnailUrl: STATIC_VIDEO_POSTER_URL,
      durationMs: 12000,
    },
    dependsOn: ['episode-01-storyboard-01'],
  },
  {
    id: 'episode-01-post-final',
    episodeId: 'episode-01',
    stage: 'post',
    type: 'video',
    title: 'Episode 01 final assembly',
    summary: `Locked final preview with picture, timing, and temporary audio pass. ${STATIC_ALIAS_EPISODE_01_FINAL_POST} preview anchor.`,
    agentRole: 'post',
    status: 'ready',
    revisionCount: 1,
    attemptCount: 1,
    attempts: [attempt('attempt-post-final-01', 'completed')],
    revisions: [revision('revision-post-final-01', 1, 'Final assembly preview ready.', 'media-post-final-01')],
    subagentSessionId: 'subagent-post-episode-01',
    parentSessionId: 'parent-main-session',
    parentToolCallId: 'tool-post-episode-01',
    mediaReference: {
      mediaItemId: 'media-post-final-01',
      kind: 'video',
      label: 'Final preview',
      previewUrl: STATIC_VIDEO_PREVIEW_URL,
      thumbnailUrl: STATIC_VIDEO_POSTER_URL,
      durationMs: 12000,
    },
    dependsOn: ['episode-01-video-01'],
  },
  {
    id: 'episode-02-video-01',
    episodeId: 'episode-02',
    stage: 'video',
    type: 'video',
    title: 'Episode 02 exterior clip',
    summary: 'A pending render for the cold street transition.',
    agentRole: 'video',
    status: 'unsupported',
    statusReason: 'Video provider is not connected in this static build.',
    revisionCount: 0,
    attemptCount: 0,
    attempts: [],
    revisions: [],
    mediaReference: { mediaItemId: 'media-video-missing', kind: 'video', label: 'Missing clip' },
    dependsOn: ['episode-02-storyboard-01'],
  },
  {
    id: 'episode-01-post-voice',
    episodeId: 'episode-01',
    stage: 'post',
    type: 'voice',
    title: 'Lead dialogue voice pass',
    summary: 'Voice preset 03, still needs final noise floor review.',
    agentRole: 'post',
    status: 'revising',
    revisionCount: 1,
    attemptCount: 2,
    attempts: [attempt('attempt-post-voice-a', 'completed'), attempt('attempt-post-voice-b', 'running')],
    revisions: [revision('revision-post-voice', 1, 'First voice pass approved for timing.')],
    dependsOn: ['episode-01-video-01'],
  },
  {
    id: 'episode-02-post-subtitle',
    episodeId: 'episode-02',
    stage: 'post',
    type: 'subtitle',
    title: 'Episode 02 subtitle pass',
    summary: 'Waiting for locked edit before subtitles can start.',
    agentRole: 'post',
    status: 'error',
    statusReason: 'No locked video edit is available.',
    failureReason: 'Video artifact is unsupported.',
    revisionCount: 0,
    attemptCount: 1,
    attempts: [attempt('attempt-subtitle-02', 'failed')],
    revisions: [],
    dependsOn: ['episode-02-video-01'],
  },
];

function createPlaceholderArtifacts(episodeNumbers: number[]): ShortDramaArtifact[] {
  return episodeNumbers.slice(2).flatMap(number => {
    const episodeId = formatEpisodeId(number);
    const episodeLabel = `Episode ${String(number).padStart(2, '0')}`;

    return [
      {
        id: `${episodeId}-storyboard-placeholder`,
        episodeId,
        stage: 'storyboards',
        type: 'storyboard',
        title: `${episodeLabel} storyboard placeholder`,
        summary: 'Placeholder storyboard card for continuous episode scrolling tests.',
        agentRole: 'director',
        status: 'pending',
        revisionCount: 0,
        attemptCount: 0,
        attempts: [],
        revisions: [],
      },
      {
        id: `${episodeId}-video-placeholder`,
        episodeId,
        stage: 'video',
        type: 'video',
        title: `${episodeLabel} video placeholder`,
        summary: 'Placeholder clip slot for testing the video stage episode rail.',
        agentRole: 'video',
        status: 'unsupported',
        statusReason: 'Static placeholder only; no video provider is connected.',
        revisionCount: 0,
        attemptCount: 0,
        attempts: [],
        revisions: [],
        dependsOn: [`${episodeId}-storyboard-placeholder`],
      },
      {
        id: `${episodeId}-post-placeholder`,
        episodeId,
        stage: 'post',
        type: 'subtitle',
        title: `${episodeLabel} post placeholder`,
        summary: 'Placeholder post-production slot for testing cross-stage positioning.',
        agentRole: 'post',
        status: 'pending',
        revisionCount: 0,
        attemptCount: 0,
        attempts: [],
        revisions: [],
        dependsOn: [`${episodeId}-video-placeholder`],
      },
    ];
  });
}

function createStaticEpisodes(episodeNumbers: number[]) {
  return episodeNumbers.map(number => {
    if (number === 1) {
      return {
        id: 'episode-01',
        number: 1,
        title: 'Episode 01',
        summary: 'Banquet hall attack, hidden letter, and first escape beat.',
        duration: '02:55',
      };
    }

    if (number === 2) {
      return {
        id: 'episode-02',
        number: 2,
        title: 'Episode 02',
        summary: 'The city outside the palace becomes the next threat.',
        duration: '02:30',
      };
    }

    return {
      id: formatEpisodeId(number),
      number,
      title: `Episode ${String(number).padStart(2, '0')}`,
      summary: 'Static placeholder episode for testing the continuous production center.',
      duration: '02:30',
    };
  });
}

export function createShortDramaStaticProject(options: ShortDramaStaticProjectOptions = {}): ShortDramaProject {
  const episodeNumbers = createEpisodeNumbers(options.episodeCount);
  const episodeIds = new Set(episodeNumbers.map(formatEpisodeId));
  const productionPlan = createProductionPlan(episodeNumbers);
  const staticArtifacts = [
    ...artifacts.filter(artifact => episodeIds.has(artifact.episodeId)),
    ...createPlaceholderArtifacts(episodeNumbers),
  ];

  return {
    projectId: 'static_short_drama_001',
    title: 'Under the Neon',
    status: 'review',
    activeStage: 'script',
    activeEpisodeId: 'episode-01',
    episodes: createStaticEpisodes(episodeNumbers),
    artifacts: staticArtifacts.map(item => ({
      ...item,
      attempts: item.attempts.map(attemptItem => ({ ...attemptItem })),
      revisions: item.revisions.map(revisionItem => ({ ...revisionItem })),
      mediaReference: item.mediaReference ? { ...item.mediaReference } : undefined,
      dependsOn: item.dependsOn ? [...item.dependsOn] : undefined,
      references: item.references ? {
        scriptSegmentIds: item.references.scriptSegmentIds ? [...item.references.scriptSegmentIds] : undefined,
        characterAssetIds: item.references.characterAssetIds ? [...item.references.characterAssetIds] : undefined,
        locationAssetIds: item.references.locationAssetIds ? [...item.references.locationAssetIds] : undefined,
        propAssetIds: item.references.propAssetIds ? [...item.references.propAssetIds] : undefined,
        storyboardArtifactIds: item.references.storyboardArtifactIds ? [...item.references.storyboardArtifactIds] : undefined,
        videoArtifactIds: item.references.videoArtifactIds ? [...item.references.videoArtifactIds] : undefined,
      } : undefined,
    })),
    productionPlan: {
      ...productionPlan,
      steps: productionPlan.steps.map(step => ({ ...step, episodeIds: [...step.episodeIds] })),
    },
    scriptBreakdown: [
      {
        episodeId: 'episode-01',
        episodeNumber: 1,
        scenes: [
          {
            id: 'breakdown-episode-01-sc01',
            episodeId: 'episode-01',
            sceneId: 'SC01',
            title: 'Banquet hall threat',
            summary: 'Chai Yong discovers the sealed letter while the banquet turns hostile.',
            characterNames: ['Chai Yong'],
            locationNames: ['banquet hall'],
            propNames: ['Half-hidden letter'],
            shots: [
              {
                id: 'breakdown-episode-01-sc01-sh01',
                episodeId: 'episode-01',
                sceneId: 'SC01',
                shotId: 'SH01',
                scriptSegmentId: 'script-segment-episode-01',
                characterNames: ['Chai Yong'],
                locationNames: ['banquet hall'],
                propNames: ['Half-hidden letter'],
                requiredBeats: ['guard discovers the sealed letter'],
                visualNotes: ['wide lantern composition breaks into handheld threat'],
              },
            ],
          },
        ],
      },
      {
        episodeId: 'episode-02',
        episodeNumber: 2,
        scenes: [
          {
            id: 'breakdown-episode-02-sc04',
            episodeId: 'episode-02',
            sceneId: 'SC04',
            title: 'Outer road escape',
            summary: 'The escape leaves the palace glow and moves to a cold exterior road.',
            characterNames: [],
            locationNames: ['Outer palace road'],
            propNames: [],
            shots: [
              {
                id: 'breakdown-episode-02-sc04-sh01',
                episodeId: 'episode-02',
                sceneId: 'SC04',
                shotId: 'SH01',
                scriptSegmentId: 'script-segment-episode-02',
                characterNames: [],
                locationNames: ['Outer palace road'],
                propNames: [],
                requiredBeats: ['cold exterior escape transition'],
                visualNotes: ['reuse the street location palette'],
              },
            ],
          },
        ],
      },
    ],
    storyboardReferencePlans: [
      {
        id: 'plan-episode-01-sc01-sh01',
        episodeId: 'episode-01',
        sceneId: 'SC01',
        shotId: 'SH01',
        scriptSegmentId: 'script-segment-episode-01',
        characterNames: ['Chai Yong'],
        locationNames: ['banquet hall'],
        propNames: ['Half-hidden letter'],
        characterAssetIds: ['episode-01-character-guard'],
        locationAssetIds: [],
        propAssetIds: ['episode-01-prop-letter'],
        unresolvedCharacterNames: [],
        unresolvedLocationNames: ['banquet hall'],
        unresolvedPropNames: [],
        requiredBeats: ['banquet hall guard discovers the sealed letter'],
        visualNotes: ['preserve guard face anchor and red seal prop'],
      },
      {
        id: 'plan-episode-02-sc04-sh01',
        episodeId: 'episode-02',
        sceneId: 'SC04',
        shotId: 'SH01',
        scriptSegmentId: 'script-segment-episode-02',
        characterNames: [],
        locationNames: ['Outer palace road'],
        propNames: [],
        characterAssetIds: [],
        locationAssetIds: ['episode-02-location-street'],
        propAssetIds: [],
        unresolvedCharacterNames: [],
        unresolvedLocationNames: [],
        unresolvedPropNames: [],
        requiredBeats: ['cold exterior escape transition'],
        visualNotes: ['reuse the street location palette'],
      },
    ],
  };
}

export function ensureShortDramaStaticPlaceholderEpisodes(project: ShortDramaProject): ShortDramaProject {
  const staticProject = createShortDramaStaticProject();
  if (project.projectId !== staticProject.projectId) {
    return project;
  }

  const existingEpisodeIds = new Set(project.episodes.map(episode => episode.id));
  const existingArtifactIds = new Set(project.artifacts.map(artifact => artifact.id));
  const missingEpisodes = staticProject.episodes.filter(episode => !existingEpisodeIds.has(episode.id));
  const missingArtifacts = staticProject.artifacts.filter(artifact => !existingArtifactIds.has(artifact.id));
  const staticArtifactsById = new Map(staticProject.artifacts.map(artifact => [artifact.id, artifact]));
  const mergedArtifacts = [
    ...project.artifacts.map(artifact => {
      const staticArtifact = staticArtifactsById.get(artifact.id);
      if (!staticArtifact?.mediaReference) {
        return artifact;
      }
      if (artifact.mediaReference?.previewUrl) {
        return artifact;
      }
      return {
        ...artifact,
        mediaReference: { ...staticArtifact.mediaReference },
      };
    }),
    ...missingArtifacts,
  ];

  return {
    ...project,
    episodes: [...project.episodes, ...missingEpisodes]
      .map(episode => ({ ...episode }))
      .sort((left, right) => left.number - right.number),
    artifacts: mergedArtifacts.map(item => ({
      ...item,
      attempts: item.attempts.map(attemptItem => ({ ...attemptItem })),
      revisions: item.revisions.map(revisionItem => ({ ...revisionItem })),
      mediaReference: item.mediaReference ? { ...item.mediaReference } : undefined,
      dependsOn: item.dependsOn ? [...item.dependsOn] : undefined,
    })),
    productionPlan: {
      ...staticProject.productionPlan,
      mode: project.productionPlan.mode,
      status: project.productionPlan.status,
      error: project.productionPlan.error,
      steps: staticProject.productionPlan.steps.map(step => ({ ...step, episodeIds: [...step.episodeIds] })),
    },
  };
}

export const staticShortDramaProject: ShortDramaProject = createShortDramaStaticProject();

export const staticShortDramaLibraryService: ShortDramaLibraryService = {
  async loadProject(workspacePath?: string): Promise<ShortDramaLibraryState> {
    if (!workspacePath?.trim()) {
      return {
        status: 'unsupported',
        source: 'static',
        error: {
          code: 'missing_workspace',
          message: 'A workspace is required to load the short drama center.',
        },
      };
    }

    return {
      status: 'ready',
      source: 'static',
      project: createShortDramaStaticProject(),
      loadedAt: Date.now(),
    };
  },
};
