import { $, browser, expect } from '@wdio/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getWorkspaceState,
  openWorkspaceThroughFrontend,
} from '../helpers/workspace-helper';
import { capturePhysicalVoidWindow } from '../helpers/screenshot-utils';

const artifactDirectory = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.codex-artifacts',
  'reusable-team-desktop-runtime',
);

type RuntimeFixture = {
  workspacePath: string;
  parentSessionId?: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  teamSkillKey: string;
  teamBRevision: string;
  teamAPath: string;
  teamBPath: string;
  teamBInstanceId?: string;
};

type RuntimeInstanceEvidence = {
  teamDefinitionId: string;
  teamInstanceId: string;
  teamDefinitionRevision: string;
  lifecycle: string;
};

type ProjectedMemberSkillEvidence = {
  memberId: string;
  role: string;
  allowedSkillKeys: string[];
};

type ProjectedTeamSkillEvidence = {
  teamDefinitionId: string;
  members: ProjectedMemberSkillEvidence[];
};

const waitForMinimalPresentation = () => browser.waitUntil(
  async () => browser.execute(() => (
    document
      .querySelector('[data-testid="app-layout"]')
      ?.getAttribute('data-ui-presentation') === 'minimal'
    && !document.querySelector('.splash-screen')
  )),
  {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: 'Minimal presentation did not settle for reusable Team smoke',
  },
);

const openIsolatedWorkspace = async (workspacePath: string) => {
  await openWorkspaceThroughFrontend(workspacePath);
  await browser.waitUntil(async () => {
    const state = await getWorkspaceState();
    const frontendState = await browser.execute(async () => {
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { workspaceManager } = await import('/src/infrastructure/services/business/workspaceManager.ts');
      const workspaceState = workspaceManager.getState();
      return {
        navigationExists: Boolean(document.querySelector('.void-nav-panel')),
        loading: workspaceState.loading,
        currentWorkspacePath: workspaceState.currentWorkspace?.rootPath ?? null,
        currentWorkspaceKind: workspaceState.currentWorkspace?.workspaceKind ?? null,
      };
    });
    return state.currentWorkspacePath === workspacePath
      && state.openedWorkspacePaths.includes(workspacePath)
      && frontendState.navigationExists
      && !frontendState.loading
      && frontendState.currentWorkspacePath === workspacePath
      && frontendState.currentWorkspaceKind === 'normal';
  }, {
    timeout: 30_000,
    interval: 250,
    timeoutMsg: `Workspace did not become active: ${workspacePath}`,
  });
};

const readBoundTeamEvidence = (
  parentSessionId: string,
  workspacePath: string,
) => browser.execute(
  async ({ sessionId, targetWorkspacePath }) => {
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    const { sessionAPI } = await import('/src/infrastructure/api/service-api/SessionAPI.ts');
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    const { desktopTeamRuntimeAdapter } = await import('/src/shared/services/customization/adapters/DesktopTeamRuntimeAdapter.ts');
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    const { teamWorkspaceProjectionService } = await import('/src/team_workspace/services/TeamWorkspaceProjectionService.ts');
    const metadata = await sessionAPI.loadSessionMetadata(
      sessionId,
      targetWorkspacePath,
    );
    const binding = metadata?.customMetadata?.customization?.activePersonaBinding;
    if (binding?.kind !== 'team_lead') {
      throw new Error('Expected a persisted Team lead binding on the parent session');
    }
    const runtimeList = await desktopTeamRuntimeAdapter.list({
      parentSessionId: sessionId,
    });
    const projection = await teamWorkspaceProjectionService.read({
      parentSessionId: sessionId,
      workspacePath: targetWorkspacePath,
      teamDefinitionId: binding.teamDefinitionId,
      teamInstanceId: binding.teamInstanceId,
    });
    return {
      binding,
      runtimeInstances: runtimeList.records.map((record: {
        snapshot: {
          instance: {
            teamDefinitionId: string;
            teamInstanceId: string;
            teamDefinitionRevision: string;
            lifecycle: string;
          };
        };
      }) => ({
        teamDefinitionId: record.snapshot.instance.teamDefinitionId,
        teamInstanceId: record.snapshot.instance.teamInstanceId,
        teamDefinitionRevision: record.snapshot.instance.teamDefinitionRevision,
        lifecycle: record.snapshot.instance.lifecycle,
      })),
      runtimeDiagnosticCodes: runtimeList.diagnostics.map(
        (diagnostic: { code: string }) => diagnostic.code,
      ),
      projectionStatus: projection.status,
      projectedTeamIds: projection.teams.map(
        (team: { teamDefinitionId: string }) => team.teamDefinitionId,
      ),
      activeTeamId: projection.activeTeam?.teamDefinitionId ?? null,
      activeTeamName: projection.activeTeam?.definition.displayName ?? null,
      projectedMemberSkills: projection.teams.map((team: {
        teamDefinitionId: string;
        members: Array<{
          definition: ProjectedMemberSkillEvidence;
        }>;
      }) => ({
        teamDefinitionId: team.teamDefinitionId,
        members: team.members.map((member: {
          definition: ProjectedMemberSkillEvidence;
        }) => ({
          memberId: member.definition.memberId,
          role: member.definition.role,
          allowedSkillKeys: [...member.definition.allowedSkillKeys],
        })),
      })),
      issueCodes: projection.issues.map((issue: { code: string }) => issue.code),
    };
  },
  { sessionId: parentSessionId, targetWorkspacePath: workspacePath },
);

type BoundTeamEvidence = Awaited<ReturnType<typeof readBoundTeamEvidence>>;

const openComposerPersonaPicker = async () => {
  await $('[data-testid="chat-input-container"]').waitForDisplayed({
    timeout: 20_000,
  });
  const boostDropdown = $('.void-chat-input__mode-dropdown--agent-boost');
  if (!(await boostDropdown.isExisting()) || !(await boostDropdown.isDisplayed())) {
    const addButton = $('.void-chat-input__agent-boost-add');
    await addButton.waitForClickable({ timeout: 20_000 });
    await addButton.click();
  }
  await boostDropdown.waitForDisplayed({ timeout: 20_000 });

  const personaTrigger = $(
    '.void-chat-input__boost-submenu-host:has(.void-chat-input__persona-submenu-shell) > .void-chat-input__boost-submenu-trigger',
  );
  await personaTrigger.waitForClickable({ timeout: 20_000 });
  await personaTrigger.click();
  await $('.void-chat-input__persona-panel[role="menu"]')
    .waitForDisplayed({ timeout: 20_000 });
};

const selectReusableTeamFromComposer = async (teamName: string) => {
  await openComposerPersonaPicker();
  let selectedTeam: WebdriverIO.Element | undefined;
  await browser.waitUntil(async () => {
    const candidates = await $$('button.void-chat-input__persona-item[role="menuitemradio"]');
    for (const candidate of candidates) {
      const name = await candidate.$('.void-chat-input__persona-item-name').getText();
      if (name.trim() === teamName) {
        selectedTeam = candidate;
        return true;
      }
    }
    return false;
  }, {
    timeout: 20_000,
    interval: 150,
    timeoutMsg: `Reusable Team did not appear in the composer: ${teamName}`,
  });
  if (!selectedTeam) {
    throw new Error(`Reusable Team selector resolved without an item: ${teamName}`);
  }
  await selectedTeam.waitForClickable({ timeout: 20_000 });
  await selectedTeam.click();
  await browser.waitUntil(async () => {
    const capsule = $('.void-chat-input__persona-capsule');
    return await capsule.isExisting()
      && await capsule.isDisplayed()
      && (await capsule.getText()).includes(teamName);
  }, {
    timeout: 20_000,
    interval: 150,
    timeoutMsg: `Composer did not show the selected Team capsule: ${teamName}`,
  });
};

const openNewTaskDraft = async (workspacePath: string) => {
  const createAction = await $('.void-nav-panel__session-create-action');
  await createAction.waitForClickable({ timeout: 20_000 });
  await createAction.click();

  const composer = await $('[data-testid="chat-input-container"]');
  await composer.waitForDisplayed({ timeout: 20_000 });
  const pickerTrigger = await $('.void-chat-input-workspace-strip__picker-trigger');
  await pickerTrigger.waitForClickable({ timeout: 20_000 });
  await pickerTrigger.click();

  const workspaceName = path.basename(workspacePath);
  let workspaceOption: WebdriverIO.Element | undefined;
  await browser.waitUntil(async () => {
    const candidates = await $$([
      '.void-chat-input-workspace-strip__picker-options',
      'button.void-chat-input-workspace-strip__picker-option[role="option"]',
    ].join(' '));
    for (const candidate of candidates) {
      if ((await candidate.getText()).trim() === workspaceName) {
        workspaceOption = candidate;
        return true;
      }
    }
    return false;
  }, {
    timeout: 20_000,
    interval: 150,
    timeoutMsg: `Isolated workspace did not appear in the draft picker: ${workspaceName}`,
  });
  if (!workspaceOption) {
    throw new Error(`Workspace picker resolved without an option: ${workspaceName}`);
  }
  await workspaceOption.waitForClickable({ timeout: 20_000 });
  await workspaceOption.click();
  await browser.waitUntil(async () => (
    (await pickerTrigger.getText()).includes(workspaceName)
  ), {
    timeout: 20_000,
    interval: 150,
    timeoutMsg: `New-task draft did not bind the isolated workspace: ${workspaceName}`,
  });
};

const listWorkspaceSessionIds = (workspacePath: string) => browser.execute(
  async (targetWorkspacePath) => {
    // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
    const { sessionAPI } = await import('/src/infrastructure/api/service-api/SessionAPI.ts');
    return (await sessionAPI.listSessions(targetWorkspacePath))
      .map((session: { sessionId: string }) => session.sessionId);
  },
  workspacePath,
);

const sendDraftAndWaitForSession = async (
  workspacePath: string,
  knownSessionIds: string[],
  message: string,
) => {
  await browser.execute((value) => {
    const input = document.querySelector<HTMLElement>(
      '[data-testid="chat-input-textarea"][contenteditable="true"]',
    );
    if (!input) throw new Error('New-task composer is unavailable');
    input.focus();
    input.textContent = value;
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: value,
      inputType: 'insertText',
    }));
  }, message);

  const sendButton = await $('[data-testid="chat-input-send-btn"]');
  await browser.waitUntil(async () => sendButton.isEnabled(), {
    timeout: 20_000,
    interval: 100,
    timeoutMsg: 'New-task send button remained disabled after Team selection',
  });
  await sendButton.click();

  let createdSessionId: string | null = null;
  await browser.waitUntil(async () => {
    const currentSessionIds = await listWorkspaceSessionIds(workspacePath);
    const createdSessionIds = currentSessionIds.filter(
      (sessionId: string) => !knownSessionIds.includes(sessionId),
    );
    if (createdSessionIds.length !== 1) return false;
    createdSessionId = createdSessionIds[0] ?? null;
    return Boolean(createdSessionId);
  }, {
    timeout: 30_000,
    interval: 250,
    timeoutMsg: 'First send did not create exactly one isolated Team session',
  });
  if (!createdSessionId) {
    throw new Error('SessionAPI diff resolved without a new parent session');
  }
  return createdSessionId;
};

const waitForBoundTeamEvidence = async (
  parentSessionId: string,
  workspacePath: string,
  expectedTeamId: string,
  expectedRuntimeCount: number,
): Promise<BoundTeamEvidence> => {
  let lastEvidence: BoundTeamEvidence | null = null;
  let lastError = '';
  await browser.waitUntil(async () => {
    try {
      lastEvidence = await readBoundTeamEvidence(parentSessionId, workspacePath);
      lastError = '';
      return lastEvidence.binding.teamDefinitionId === expectedTeamId
        && lastEvidence.activeTeamId === expectedTeamId
        && lastEvidence.runtimeInstances.length === expectedRuntimeCount
        && lastEvidence.runtimeInstances.every(
          (instance: RuntimeInstanceEvidence) => instance.lifecycle === 'ready',
        )
        && lastEvidence.runtimeDiagnosticCodes.length === 0
        && lastEvidence.issueCodes.length === 0;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }, {
    timeout: 30_000,
    interval: 250,
    timeoutMsg: `Team runtime did not settle for ${expectedTeamId}; last error: ${lastError}`,
  });
  return lastEvidence
    ?? readBoundTeamEvidence(parentSessionId, workspacePath);
};

describe('L0 reusable Team real desktop runtime', () => {
  let sourceUrl = '';
  let originalWindowSize = { width: 1280, height: 800 };
  let fixture: RuntimeFixture | null = null;

  before(async () => {
    const runtimeRoot = process.env.VOID_E2E_RUNTIME_ROOT;
    if (!runtimeRoot) {
      throw new Error('VOID_E2E_RUNTIME_ROOT is required for isolated Team smoke');
    }
    const workspacePath = path.join(runtimeRoot, 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, 'README.md'),
      '# Reusable Team isolated E2E workspace\n',
      'utf8',
    );

    sourceUrl = await browser.getUrl();
    originalWindowSize = await browser.getWindowSize();
    await waitForMinimalPresentation();
    await openIsolatedWorkspace(workspacePath);
    await browser.setWindowSize(1600, 1000);

    const suffix = Date.now().toString(36);
    fixture = await browser.execute(async ({ targetWorkspacePath, idSuffix }) => {
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { configAPI } = await import('/src/infrastructure/api/service-api/ConfigAPI.ts');
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { globalStateAPI } = await import('/src/shared/types/global-state.ts');
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { ExistingTeamCatalogAdapter } = await import('/src/shared/services/customization/adapters/ExistingTeamCatalogAdapter.ts');

      type RuntimeSkill = {
        key: string;
        effectiveEnabled: boolean;
        selectedForRuntime: boolean;
        isShadowed?: boolean;
        stateReason: string;
      };
      const modeSkills: RuntimeSkill[] = await configAPI.getModeSkillConfigs({
        modeId: 'agentic',
        workspacePath: targetWorkspacePath,
      });
      const runtimeSkills = [...modeSkills]
        .filter((skill: RuntimeSkill) => (
          skill.effectiveEnabled
          && skill.selectedForRuntime
          && !skill.isShadowed
        ))
        .sort((left: RuntimeSkill, right: RuntimeSkill) => (
          left.key.localeCompare(right.key, 'en')
        ));
      const teamSkill = runtimeSkills[0];
      if (!teamSkill) {
        throw new Error(`No effective runtime Skill is available: ${JSON.stringify({
          total: modeSkills.length,
          skills: modeSkills.map((skill: RuntimeSkill) => ({
            key: skill.key,
            effectiveEnabled: skill.effectiveEnabled,
            selectedForRuntime: skill.selectedForRuntime,
            isShadowed: Boolean(skill.isShadowed),
            stateReason: skill.stateReason,
          })),
        })}`);
      }

      const draft = (label: 'A' | 'B') => ({
        displayName: `桌面交付团队 ${label} ${idSuffix}`,
        description: `验证团队 ${label} 的真实创建、激活、绑定与恢复。`,
        category: '技术工程',
        capabilityTags: ['软件开发'],
        scenarioEligibility: ['code'],
        leadMemberKey: 'lead',
        members: [
          {
            clientKey: 'lead',
            displayName: `${label} 主理人`,
            professionalRole: '技术统筹',
            role: 'lead',
            instructions: '拆分目标、调度成员并汇总可验证结果。',
            outputResponsibility: '交付最终方案与验证结论。',
            agentId: 'agentic',
            allowedSkillKeys: [],
            allowedToolNames: [],
            isReadonly: false,
          },
          {
            clientKey: 'developer',
            displayName: `${label} 开发工程师`,
            professionalRole: '实现专家',
            role: 'specialist',
            instructions: '根据主理人任务完成实现并回传证据。',
            outputResponsibility: '提交实现方案和可复核证据。',
            agentId: 'agentic',
            allowedSkillKeys: label === 'B' ? [teamSkill.key] : [],
            allowedToolNames: [],
            isReadonly: false,
          },
        ],
        workflows: [{
          clientKey: 'delivery',
          displayName: '软件交付',
          triggerDescription: '需要完成可验证的软件交付时使用。',
          phases: [{
            clientKey: 'implementation',
            displayName: '实现',
            kind: 'serial',
            dependsOnPhaseKeys: [],
            assignedMemberKeys: ['developer'],
            expectedOutputs: ['实现方案'],
            completionRule: '提交可验证方案。',
          }],
        }],
      });

      const teamA = await configAPI.createTeamDefinition({
        level: 'project',
        workspacePath: targetWorkspacePath,
        draft: draft('A'),
      });
      const teamB = await configAPI.createTeamDefinition({
        level: 'project',
        workspacePath: targetWorkspacePath,
        draft: draft('B'),
      });
      const currentWorkspace = await globalStateAPI.getCurrentWorkspace();
      if (
        currentWorkspace?.rootPath !== targetWorkspacePath
        || currentWorkspace.workspaceKind !== 'normal'
      ) {
        throw new Error(
          `Expected an isolated normal workspace, received ${JSON.stringify(currentWorkspace)}`,
        );
      }
      if (
        teamA.definition.scenarioEligibility.join(',') !== 'code'
        || teamB.definition.scenarioEligibility.join(',') !== 'code'
      ) {
        throw new Error(
          `Created Team scenario mismatch: ${JSON.stringify({
            teamA: teamA.definition.scenarioEligibility,
            teamB: teamB.definition.scenarioEligibility,
          })}`,
        );
      }
      const catalog = await new ExistingTeamCatalogAdapter().load({
        workspacePath: targetWorkspacePath,
      });
      const entryA = catalog.entries.find(
        (entry: { kind: string; identity: { id: string } }) => (
          entry.kind === 'team'
          && entry.identity.id === teamA.definition.teamDefinitionId
        ),
      );
      const entryB = catalog.entries.find(
        (entry: { kind: string; identity: { id: string } }) => (
          entry.kind === 'team'
          && entry.identity.id === teamB.definition.teamDefinitionId
        ),
      );
      if (!entryA || !entryB) {
        throw new Error('Created Teams were not projected into the real catalog');
      }
      if (
        entryA.activationSupport !== 'parent_persona'
        || entryB.activationSupport !== 'parent_persona'
      ) {
        throw new Error('Created Teams are not reusable parent personas');
      }

      return {
        workspacePath: targetWorkspacePath,
        teamAId: teamA.definition.teamDefinitionId,
        teamBId: teamB.definition.teamDefinitionId,
        teamAName: teamA.definition.displayName,
        teamBName: teamB.definition.displayName,
        teamSkillKey: teamSkill.key,
        teamBRevision: teamB.revision,
        teamAPath: teamA.path,
        teamBPath: teamB.path,
      };
    }, { targetWorkspacePath: workspacePath, idSuffix: suffix });
  });

  it('creates, attaches and projects the exact last selected Team', async () => {
    if (!fixture) throw new Error('Reusable Team fixture was not created');
    const expectedTeamDirectory = path.resolve(
      fixture.workspacePath,
      '.void',
      'teams',
    );
    for (const [recordPath, teamId] of [
      [fixture.teamAPath, fixture.teamAId],
      [fixture.teamBPath, fixture.teamBId],
    ] as const) {
      expect(fs.existsSync(recordPath)).toBe(true);
      expect(path.resolve(recordPath)).toBe(
        path.join(expectedTeamDirectory, teamId, 'team.json'),
      );
    }

    await openNewTaskDraft(fixture.workspacePath);
    await selectReusableTeamFromComposer(fixture.teamAName);
    await selectReusableTeamFromComposer(fixture.teamBName);
    const draftCapsule = await $('.void-chat-input__persona-capsule');
    expect(await draftCapsule.getText()).toContain(fixture.teamBName);
    expect(await draftCapsule.getAttribute('data-persona-locked')).toBeNull();

    const sessionsBeforeSend = await listWorkspaceSessionIds(fixture.workspacePath);
    const probe = `只实例化最后选中的 B 团队 ${Date.now().toString(36)}`;
    fixture.parentSessionId = await sendDraftAndWaitForSession(
      fixture.workspacePath,
      sessionsBeforeSend,
      probe,
    );

    const evidenceB = await waitForBoundTeamEvidence(
      fixture.parentSessionId,
      fixture.workspacePath,
      fixture.teamBId,
      1,
    );
    fixture.teamBInstanceId = evidenceB.binding.teamInstanceId;
    expect(evidenceB.runtimeDiagnosticCodes).toEqual([]);
    expect(evidenceB.runtimeInstances).toEqual([
      expect.objectContaining({
        teamDefinitionId: fixture.teamBId,
        teamInstanceId: fixture.teamBInstanceId,
        teamDefinitionRevision: fixture.teamBRevision,
        lifecycle: 'ready',
      }),
    ]);
    expect(evidenceB.runtimeInstances.some(
      (instance: RuntimeInstanceEvidence) => (
        instance.teamDefinitionId === fixture?.teamAId
      ),
    )).toBe(false);
    expect(evidenceB.binding.teamDefinitionId).toBe(fixture.teamBId);
    expect(evidenceB.binding.teamInstanceId).toBe(fixture.teamBInstanceId);
    expect(evidenceB.projectionStatus).toBe('ready');
    expect(evidenceB.projectedTeamIds).toEqual([fixture.teamBId]);
    expect(evidenceB.activeTeamId).toBe(fixture.teamBId);
    const projectedTeamB = evidenceB.projectedMemberSkills.find(
      (team: ProjectedTeamSkillEvidence) => team.teamDefinitionId === fixture?.teamBId,
    );
    expect(projectedTeamB?.members.some(
      (member: ProjectedMemberSkillEvidence) => member.role === 'lead',
    )).toBe(false);
    expect(projectedTeamB?.members.find(
      (member: ProjectedMemberSkillEvidence) => member.role === 'specialist',
    )
      ?.allowedSkillKeys).toEqual([fixture.teamSkillKey]);
    expect(evidenceB.issueCodes).toEqual([]);

    const lockedCapsule = await $('.void-chat-input__persona-capsule');
    await lockedCapsule.waitForDisplayed({ timeout: 20_000 });
    expect(await lockedCapsule.getText()).toContain(fixture.teamBName);
    expect(await lockedCapsule.getAttribute('data-persona-locked')).toBe('true');
    expect(await lockedCapsule.$('.void-chat-input__agent-capsule-close').isExisting())
      .toBe(false);

    const addButton = await $('.void-chat-input__agent-boost-add');
    await addButton.waitForClickable({ timeout: 20_000 });
    await addButton.click();
    const boostDropdown = await $('.void-chat-input__mode-dropdown--agent-boost');
    await boostDropdown.waitForDisplayed({ timeout: 20_000 });
    expect(await boostDropdown.$('.void-chat-input__persona-submenu-shell').isExisting())
      .toBe(false);
    await addButton.click();
  });

  it('restores the Team B binding after a real desktop refresh', async () => {
    if (!fixture) throw new Error('Reusable Team fixture was not created');
    if (!fixture.parentSessionId) throw new Error('Reusable Team parent session was not created');
    const parentSessionId = fixture.parentSessionId;
    await browser.refresh();
    await waitForMinimalPresentation();
    await openIsolatedWorkspace(fixture.workspacePath);
    await browser.execute(async ({ workspacePath, sessionId }) => {
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { flowChatManager } = await import('/src/flow_chat/services/FlowChatManager.ts');
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { openMainSession } = await import('/src/flow_chat/services/openBtwSession.ts');
      await flowChatManager.initialize(workspacePath, 'agentic');
      await openMainSession(sessionId);
    }, {
      workspacePath: fixture.workspacePath,
      sessionId: parentSessionId,
    });

    const evidence = await waitForBoundTeamEvidence(
      parentSessionId,
      fixture.workspacePath,
      fixture.teamBId,
      1,
    );
    expect(evidence.binding.teamDefinitionId).toBe(fixture.teamBId);
    expect(evidence.binding.teamInstanceId).toBe(fixture.teamBInstanceId);
    expect(evidence.activeTeamId).toBe(fixture.teamBId);
    expect(evidence.runtimeInstances).toEqual([
      expect.objectContaining({
        teamDefinitionId: fixture.teamBId,
        teamInstanceId: fixture.teamBInstanceId,
        teamDefinitionRevision: fixture.teamBRevision,
        lifecycle: 'ready',
      }),
    ]);
    expect(evidence.projectedTeamIds).toEqual([fixture.teamBId]);
    const restoredTeamB = evidence.projectedMemberSkills.find(
      (team: ProjectedTeamSkillEvidence) => team.teamDefinitionId === fixture?.teamBId,
    );
    expect(restoredTeamB?.members.find(
      (member: ProjectedMemberSkillEvidence) => member.role === 'specialist',
    )
      ?.allowedSkillKeys).toEqual([fixture.teamSkillKey]);

    const teamToggle = await $('[data-testid="session-team-workspace-toggle"]');
    await teamToggle.waitForClickable({ timeout: 20_000 });
    expect(await teamToggle.getAttribute('aria-label')).toContain(
      fixture.teamBName,
    );
    if ((await teamToggle.getAttribute('aria-expanded')) !== 'true') {
      await teamToggle.click();
    }
    const teamPanel = await $('[data-testid="session-team-workspace-panel"]');
    await teamPanel.waitForDisplayed({ timeout: 20_000 });
    expect(await teamPanel.getText()).toContain('B 开发工程师');

    const layout = await browser.execute(() => {
      const rect = (selector: string) => (
        document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
      );
      const app = rect('[data-testid="app-layout"]');
      const navigation = rect('.void-nav-panel');
      const top = rect('.void-nav-bar, .void-scene-bar');
      const panel = rect('[data-testid="session-team-workspace-panel"]');
      const controls = rect('.window-controls');
      return {
        documentOverflow:
          document.documentElement.scrollWidth
          - document.documentElement.clientWidth,
        appCoversViewport: Boolean(
          app
          && app.left <= 1
          && app.top <= 1
          && app.right >= window.innerWidth - 1
          && app.bottom >= window.innerHeight - 1
        ),
        navigationVisible: Boolean(
          navigation
          && navigation.width > 0
          && navigation.height > window.innerHeight * 0.7
          && navigation.left >= -1
          && navigation.right <= window.innerWidth + 1
          && navigation.top >= -1
          && navigation.bottom <= window.innerHeight + 1
        ),
        topVisible: Boolean(top && top.top >= -1 && top.right <= window.innerWidth + 1),
        panelVisible: Boolean(
          panel
          && panel.width > 0
          && panel.right <= window.innerWidth + 1
          && panel.bottom <= window.innerHeight + 1
        ),
        windowControlsVisible: Boolean(
          controls
          && controls.width > 0
          && controls.top >= -1
          && controls.right <= window.innerWidth + 1
        ),
      };
    });
    expect(layout.documentOverflow).toBeLessThanOrEqual(1);
    expect(layout.appCoversViewport).toBe(true);
    expect(layout.navigationVisible).toBe(true);
    expect(layout.topVisible).toBe(true);
    expect(layout.panelVisible).toBe(true);
    expect(layout.windowControlsVisible).toBe(true);

    const capture = await capturePhysicalVoidWindow(
      'reusable-team-bound-restored',
      { directory: artifactDirectory },
    );
    expect(capture.metadata.dpi_awareness).toContain('PerMonitorV2');
    expect(capture.metadata.capture_bounds.width).toBeGreaterThan(0);
    expect(capture.metadata.capture_bounds.height).toBeGreaterThan(0);
  });

  it('edits bounded member delegation through the real Team authoring UI', async () => {
    if (!fixture) throw new Error('Reusable Team fixture was not created');

    const specialistMemberId = await browser.execute(async current => {
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { configAPI } = await import('/src/infrastructure/api/service-api/ConfigAPI.ts');
      const record = await configAPI.getTeamDefinition({
        teamDefinitionId: current.teamBId,
        level: 'project',
        workspacePath: current.workspacePath,
      });
      const specialist = record.definition.members.find(
        (member: { role: string }) => member.role === 'specialist',
      );
      if (!specialist) throw new Error('Team B specialist is unavailable');
      return specialist.memberId as string;
    }, fixture);

    const extensionsToggle = await $('.void-nav-panel__top-action-btn--expand');
    await extensionsToggle.waitForClickable({ timeout: 20_000 });
    if ((await extensionsToggle.getAttribute('aria-expanded')) !== 'true') {
      await extensionsToggle.click();
    }
    const agentsNavigation = await $('[data-testid="nav-agents"]');
    await agentsNavigation.waitForClickable({ timeout: 20_000 });
    await agentsNavigation.click();
    await $('.void-agents-shell').waitForDisplayed({ timeout: 20_000 });

    const teamsTab = await $('.agents-catalog-tabs button[role="tab"]:nth-child(2)');
    await teamsTab.waitForClickable({ timeout: 20_000 });
    await teamsTab.click();

    let teamCard: WebdriverIO.Element | undefined;
    await browser.waitUntil(async () => {
      const cards = await $$('.agent-team-card[role="button"]');
      for (const card of cards) {
        if ((await card.getAttribute('aria-label')) === fixture?.teamBName) {
          teamCard = card;
          return true;
        }
      }
      return false;
    }, {
      timeout: 20_000,
      interval: 150,
      timeoutMsg: `Team B did not appear in the Team catalog: ${fixture.teamBName}`,
    });
    if (!teamCard) throw new Error('Team B card resolved without an element');
    await teamCard.waitForClickable({ timeout: 20_000 });
    await teamCard.click();

    const editButton = await $('[data-testid="team-catalog-edit-definition"]');
    await editButton.waitForClickable({ timeout: 20_000 });
    await editButton.click();

    const delegationToggle = await $(`[data-testid="team-member-delegation-toggle-${specialistMemberId}"]`);
    const maxTasks = () => $(`[data-testid="team-member-delegation-max-tasks-${specialistMemberId}"]`);
    const maxParallel = () => $(`[data-testid="team-member-delegation-max-parallel-${specialistMemberId}"]`);
    await delegationToggle.waitForClickable({ timeout: 20_000 });
    expect(await delegationToggle.isSelected()).toBe(true);
    expect(await maxTasks().getValue()).toBe('8');
    expect(await maxParallel().getValue()).toBe('3');

    await delegationToggle.click();
    expect(await maxTasks().isExisting()).toBe(false);
    expect(await maxParallel().isExisting()).toBe(false);
    await delegationToggle.click();
    await maxTasks().waitForDisplayed({ timeout: 20_000 });
    expect(await maxTasks().getValue()).toBe('8');
    expect(await maxParallel().getValue()).toBe('3');

    const announcementDismiss = await $('[data-testid="announcement-toast-dismiss"]');
    if (await announcementDismiss.isExisting() && await announcementDismiss.isDisplayed()) {
      await announcementDismiss.click();
      await announcementDismiss.waitForDisplayed({ reverse: true, timeout: 5_000 });
    }

    const authoringCapture = await capturePhysicalVoidWindow(
      'team-bounded-delegation-authoring',
      { directory: artifactDirectory },
    );
    expect(authoringCapture.metadata.dpi_awareness).toContain('PerMonitorV2');

    await maxTasks().setValue('2');
    await maxParallel().setValue('3');
    const submit = await $('[data-testid="team-authoring-submit"]');
    await submit.waitForClickable({ timeout: 20_000 });
    await submit.click();
    const validationError = await $('.team-authoring__error');
    await validationError.waitForDisplayed({ timeout: 20_000 });

    await maxTasks().setValue('12');
    await maxParallel().setValue('4');
    await submit.click();
    await browser.waitUntil(async () => !(await submit.isExisting()), {
      timeout: 20_000,
      interval: 150,
      timeoutMsg: 'Team authoring did not close after saving valid delegation limits',
    });

    const savedPolicy = await browser.execute(async current => {
      // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
      const { configAPI } = await import('/src/infrastructure/api/service-api/ConfigAPI.ts');
      const record = await configAPI.getTeamDefinition({
        teamDefinitionId: current.teamBId,
        level: 'project',
        workspacePath: current.workspacePath,
      });
      return record.definition.members.find(
        (member: { memberId: string }) => member.memberId === current.memberId,
      )?.delegationPolicy ?? null;
    }, {
      workspacePath: fixture.workspacePath,
      teamBId: fixture.teamBId,
      memberId: specialistMemberId,
    });
    expect(savedPolicy).toEqual({
      kind: 'bounded',
      maxWorkerTasks: 12,
      maxParallelWorkers: 4,
    });
  });

  after(async () => {
    if (fixture) {
      try {
        const cleanup = await browser.execute(async (current) => {
          // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
          const { configAPI } = await import('/src/infrastructure/api/service-api/ConfigAPI.ts');
          // @ts-expect-error Resolved by Vite inside the embedded browser runtime.
          const { flowChatManager } = await import('/src/flow_chat/services/FlowChatManager.ts');
          if (current.parentSessionId) {
            await flowChatManager.deleteChatSession(current.parentSessionId);
          }
          await configAPI.deleteTeamDefinition({
            teamDefinitionId: current.teamAId,
            level: 'project',
            workspacePath: current.workspacePath,
          });
          await configAPI.deleteTeamDefinition({
            teamDefinitionId: current.teamBId,
            level: 'project',
            workspacePath: current.workspacePath,
          });
          const remaining = await configAPI.listTeamDefinitions({
            workspacePath: current.workspacePath,
          });
          return remaining.records
            .map((record: { definition: { teamDefinitionId: string } }) => (
              record.definition.teamDefinitionId
            ))
            .filter((id: string) => id === current.teamAId || id === current.teamBId);
        }, fixture);
        if (cleanup.length > 0) {
          console.error(`Reusable Team cleanup left definitions: ${cleanup.join(', ')}`);
        }
      } catch (error) {
        console.error('Reusable Team cleanup failed without masking primary evidence:', error);
      }
    }
    await browser.setWindowSize(
      originalWindowSize.width,
      originalWindowSize.height,
    );
    await browser.url(sourceUrl);
  });
});
