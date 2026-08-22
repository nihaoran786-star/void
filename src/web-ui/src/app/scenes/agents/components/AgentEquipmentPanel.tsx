import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Switch } from '@/component-library';
import type { AgentWithCapabilities } from '../agentsStore';
import type { ToolInfo } from '@/shared/types/agent-api';
import type { AgentProfileConfigItem, ModeSkillInfo } from '@/infrastructure/config/types';
import type { SubagentInfo } from '@/infrastructure/api/service-api/SubagentAPI';
import {
  buildAgentToolGroups,
  setCapabilityGroupEnabled,
  type ToolGroupLabels,
} from '../agentCapabilityGroups';
import {
  buildDuplicateSkillNameSet,
  buildSkillGroups,
  formatSkillDisplayName,
  getConfiguredEnabledSkillKeys,
  getSkillTitle,
  subagentPresentation,
} from '../agentEquipmentModel';
import './AgentEquipmentPanel.scss';

export interface AgentEquipmentPanelProps {
  agent: AgentWithCapabilities;
  availableTools: ToolInfo[];
  modeConfig: AgentProfileConfigItem | null;
  modeSkills: ModeSkillInfo[];
  manageableSubagents: SubagentInfo[];
  onSetTools: (agentId: string, toolNames: string[]) => Promise<void>;
  onResetTools: (agentId: string) => Promise<void>;
  onSetSkills: (agentId: string, enabledSkillKeys: string[]) => Promise<void>;
  onResetSkills: (agentId: string) => Promise<void>;
  onSetSubagentEnabled: (
    agentId: string,
    subagent: Pick<SubagentInfo, 'key' | 'id'>,
    enabled: boolean,
  ) => Promise<void>;
}

const AgentEquipmentPanel: React.FC<AgentEquipmentPanelProps> = ({
  agent,
  availableTools,
  modeConfig,
  modeSkills,
  manageableSubagents,
  onSetTools,
  onResetTools,
  onSetSkills,
  onResetSkills,
  onSetSubagentEnabled,
}) => {
  const { t } = useTranslation('scenes/agents');
  const { t: tSkills } = useTranslation('scenes/skills');

  const [pendingTools, setPendingTools] = useState<string[] | null>(null);
  const [toolsEditing, setToolsEditing] = useState(false);
  const [savingTools, setSavingTools] = useState(false);
  const [pendingSkills, setPendingSkills] = useState<string[] | null>(null);
  const [skillsEditing, setSkillsEditing] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [pendingSubagentKeys, setPendingSubagentKeys] = useState<string[] | null>(null);
  const [subagentsEditing, setSubagentsEditing] = useState(false);
  const [savingSubagents, setSavingSubagents] = useState(false);

  const isMode = agent.agentKind === 'mode';
  const enabledTools = useMemo(
    () => (isMode ? (modeConfig?.enabled_tools ?? agent.defaultTools ?? []) : (agent.defaultTools ?? [])),
    [isMode, modeConfig, agent.defaultTools],
  );
  const hasSkillTool = isMode && enabledTools.includes('Skill');
  const hasTaskTool = isMode && enabledTools.includes('Task');

  const enabledSkillKeys = useMemo(
    () => getConfiguredEnabledSkillKeys(modeSkills),
    [modeSkills],
  );
  const skillItems = useMemo(
    () => modeSkills.filter((skill) => skill.effectiveEnabled),
    [modeSkills],
  );
  const duplicateSkillNames = useMemo(
    () => buildDuplicateSkillNameSet(modeSkills),
    [modeSkills],
  );
  const editableSkillGroups = useMemo(
    () => buildSkillGroups(modeSkills, pendingSkills ?? enabledSkillKeys, t),
    [modeSkills, pendingSkills, enabledSkillKeys, t],
  );
  const readOnlySkillGroups = useMemo(
    () => buildSkillGroups(modeSkills, enabledSkillKeys, t),
    [modeSkills, enabledSkillKeys, t],
  );

  const toolGroupLabels = useMemo<ToolGroupLabels>(() => ({
    core: t('agentsOverview.toolGroups.core'),
    on_demand: t('agentsOverview.toolGroups.onDemand'),
    mcp: t('agentsOverview.toolGroups.mcp'),
    integration: t('agentsOverview.toolGroups.integration'),
  }), [t]);
  const editableToolGroups = useMemo(
    () => buildAgentToolGroups(availableTools, pendingTools ?? enabledTools, toolGroupLabels),
    [availableTools, pendingTools, enabledTools, toolGroupLabels],
  );

  const enabledSubagentKeys = useMemo(
    () => manageableSubagents.filter((subagent) => subagent.effectiveEnabled).map((subagent) => subagent.key),
    [manageableSubagents],
  );
  const enabledSubagents = useMemo(
    () => manageableSubagents.filter((subagent) => subagent.effectiveEnabled),
    [manageableSubagents],
  );
  const defaultEnabledSubagentKeys = useMemo(
    () => manageableSubagents.filter((subagent) => subagent.defaultEnabled).map((subagent) => subagent.key),
    [manageableSubagents],
  );

  const togglePendingTool = useCallback((toolName: string) => {
    setPendingTools((prev) => {
      const current = prev ?? enabledTools;
      return current.includes(toolName)
        ? current.filter((name) => name !== toolName)
        : [...current, toolName];
    });
  }, [enabledTools]);

  const setPendingToolGroupEnabled = useCallback((toolNames: string[], enabled: boolean) => {
    setPendingTools((prev) => setCapabilityGroupEnabled(prev ?? enabledTools, toolNames, enabled));
  }, [enabledTools]);

  const togglePendingSkill = useCallback((skillKey: string) => {
    setPendingSkills((prev) => {
      const current = prev ?? enabledSkillKeys;
      return current.includes(skillKey)
        ? current.filter((key) => key !== skillKey)
        : [...current, skillKey];
    });
  }, [enabledSkillKeys]);

  const setPendingSkillGroupEnabled = useCallback((skills: ModeSkillInfo[], enabled: boolean) => {
    setPendingSkills((prev) => setCapabilityGroupEnabled(
      prev ?? enabledSkillKeys,
      skills.map((skill) => skill.key),
      enabled,
    ));
  }, [enabledSkillKeys]);

  const togglePendingSubagent = useCallback((subagentKey: string) => {
    setPendingSubagentKeys((prev) => {
      const current = prev ?? enabledSubagentKeys;
      return current.includes(subagentKey)
        ? current.filter((key) => key !== subagentKey)
        : [...current, subagentKey];
    });
  }, [enabledSubagentKeys]);

  const changedSubagents = useCallback((targetKeys: ReadonlySet<string>) => (
    manageableSubagents.filter((subagent) => {
      const current = enabledSubagentKeys.includes(subagent.key);
      return current !== targetKeys.has(subagent.key);
    })
  ), [manageableSubagents, enabledSubagentKeys]);

  const startEditTools = useCallback(() => {
    setPendingTools([...enabledTools]);
    setToolsEditing(true);
  }, [enabledTools]);

  const cancelEditTools = useCallback(() => {
    setPendingTools(null);
    setToolsEditing(false);
  }, []);

  const saveTools = useCallback(async () => {
    if (!pendingTools) {
      setToolsEditing(false);
      return;
    }
    setSavingTools(true);
    try {
      await onSetTools(agent.id, pendingTools);
    } finally {
      setSavingTools(false);
      setToolsEditing(false);
      setPendingTools(null);
    }
  }, [agent.id, onSetTools, pendingTools]);

  const resetTools = useCallback(async () => {
    setSavingTools(true);
    try {
      await onResetTools(agent.id);
    } finally {
      setSavingTools(false);
      setToolsEditing(false);
      setPendingTools(null);
    }
  }, [agent.id, onResetTools]);

  const enableSkillTool = useCallback(async () => {
    setSavingSkills(true);
    try {
      await onSetTools(agent.id, [...enabledTools, 'Skill']);
    } finally {
      setSavingSkills(false);
    }
  }, [agent.id, enabledTools, onSetTools]);

  const enableTaskTool = useCallback(async () => {
    setSavingSubagents(true);
    try {
      await onSetTools(agent.id, [...enabledTools, 'Task']);
    } finally {
      setSavingSubagents(false);
    }
  }, [agent.id, enabledTools, onSetTools]);

  const startEditSkills = useCallback(() => {
    setPendingSkills([...enabledSkillKeys]);
    setSkillsEditing(true);
  }, [enabledSkillKeys]);

  const cancelEditSkills = useCallback(() => {
    setPendingSkills(null);
    setSkillsEditing(false);
  }, []);

  const saveSkills = useCallback(async () => {
    if (!pendingSkills) {
      setSkillsEditing(false);
      return;
    }
    setSavingSkills(true);
    try {
      await onSetSkills(agent.id, pendingSkills);
    } finally {
      setSavingSkills(false);
      setSkillsEditing(false);
      setPendingSkills(null);
    }
  }, [agent.id, onSetSkills, pendingSkills]);

  const resetSkills = useCallback(async () => {
    setSavingSkills(true);
    try {
      await onResetSkills(agent.id);
    } finally {
      setSavingSkills(false);
      setSkillsEditing(false);
      setPendingSkills(null);
    }
  }, [agent.id, onResetSkills]);

  const startEditSubagents = useCallback(() => {
    setPendingSubagentKeys([...enabledSubagentKeys]);
    setSubagentsEditing(true);
  }, [enabledSubagentKeys]);

  const cancelEditSubagents = useCallback(() => {
    setPendingSubagentKeys(null);
    setSubagentsEditing(false);
  }, []);

  const saveSubagents = useCallback(async () => {
    const nextKeys = new Set(pendingSubagentKeys ?? enabledSubagentKeys);
    const changed = changedSubagents(nextKeys);
    if (changed.length === 0) {
      setSubagentsEditing(false);
      setPendingSubagentKeys(null);
      return;
    }
    setSavingSubagents(true);
    try {
      for (const subagent of changed) {
        await onSetSubagentEnabled(agent.id, subagent, nextKeys.has(subagent.key));
      }
    } finally {
      setSavingSubagents(false);
      setSubagentsEditing(false);
      setPendingSubagentKeys(null);
    }
  }, [agent.id, changedSubagents, enabledSubagentKeys, onSetSubagentEnabled, pendingSubagentKeys]);

  const resetSubagents = useCallback(async () => {
    const defaultKeys = new Set(defaultEnabledSubagentKeys);
    const changed = changedSubagents(defaultKeys);
    if (changed.length === 0) {
      setSubagentsEditing(false);
      setPendingSubagentKeys(null);
      return;
    }
    setSavingSubagents(true);
    try {
      for (const subagent of changed) {
        await onSetSubagentEnabled(agent.id, subagent, defaultKeys.has(subagent.key));
      }
    } finally {
      setSavingSubagents(false);
      setSubagentsEditing(false);
      setPendingSubagentKeys(null);
    }
  }, [agent.id, changedSubagents, defaultEnabledSubagentKeys, onSetSubagentEnabled]);

  const toolsCount = isMode
    ? `${enabledTools.length}/${availableTools.length}`
    : `${enabledTools.length}`;

  return (
    <div className="agent-equipment-panel">
      {/* Equipment section */}
      <section className="agent-equipment-section" aria-labelledby="agent-equipment-tools-title">
        <header className="agent-equipment-section__head">
          <div className="agent-equipment-section__titles">
            <h3
              id="agent-equipment-tools-title"
              className="agent-equipment-section__title"
            >
              {t('agentsOverview.equipment.toolsTitle')}
            </h3>
            <span className="agent-equipment-section__count">{toolsCount}</span>
          </div>
          <div className="agent-equipment-section__actions">
            {isMode ? (
              toolsEditing ? (
                <>
                  {/* Two choices while editing: keep them or drop them.
                      "Restore defaults" is a text link down in the body. */}
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={savingTools}
                    onClick={cancelEditTools}
                  >
                    {t('agentsOverview.equipment.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    isLoading={savingTools}
                    onClick={() => void saveTools()}
                  >
                    {t('agentsOverview.equipment.save')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="small"
                  disabled={savingTools}
                  onClick={startEditTools}
                >
                  {t('agentsOverview.equipment.edit')}
                </Button>
              )
            ) : null}
          </div>
        </header>
        <div className="agent-equipment-section__body">
          {savingTools ? (
            <p className="agent-equipment-status agent-equipment-status--saving">
              {t('agentsOverview.equipment.saving')}
            </p>
          ) : isMode && toolsEditing ? (
            <div className="agent-equipment__groups">
              {editableToolGroups.map((group) => {
                const allEnabled = group.enabledCount === group.totalCount;
                const someEnabled = group.enabledCount > 0;
                return (
                  <div key={group.key} className="agent-equipment__group">
                    <div className="agent-equipment__group-head">
                      <div className="agent-equipment__group-titles">
                        <span className="agent-equipment__group-title">{group.label}</span>
                        <span className="agent-equipment__group-count">
                          {`${group.enabledCount}/${group.totalCount}`}
                        </span>
                        {group.onDemandCount > 0 ? (
                          <span
                            className="agent-equipment__group-count"
                            title={t('agentsOverview.equipment.onDemandDescription')}
                          >
                            {t('agentsOverview.equipment.onDemandCount', {
                              count: group.onDemandCount,
                            })}
                          </span>
                        ) : null}
                      </div>
                      <div className="agent-equipment__group-actions">
                        <Switch
                          size="small"
                          checked={allEnabled}
                          disabled={savingTools}
                          onChange={(event) => setPendingToolGroupEnabled(
                            group.tools.map((tool) => tool.name),
                            event.target.checked,
                          )}
                          aria-label={
                            allEnabled
                              ? t('agentsOverview.equipment.disableGroup')
                              : t('agentsOverview.equipment.enableGroup')
                          }
                        />
                        {someEnabled && !allEnabled ? (
                          <Button
                            variant="ghost"
                            size="small"
                            disabled={savingTools}
                            onClick={() => setPendingToolGroupEnabled(
                              group.tools.map((tool) => tool.name),
                              false,
                            )}
                          >
                            {t('agentsOverview.equipment.clearGroup')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="agent-equipment__tokens">
                      {group.tools.map((tool) => {
                        const isOn = (pendingTools ?? enabledTools).includes(tool.name);
                        const loadMode = tool.load_mode === 'on_demand'
                          ? t('agentsOverview.equipment.onDemandDescription')
                          : t('agentsOverview.equipment.expandedDescription');
                        return (
                          <button
                            key={tool.name}
                            type="button"
                            disabled={savingTools}
                            className={`agent-equipment__token${isOn ? ' is-on' : ''}`}
                            title={[tool.description || tool.name, loadMode].join('\n')}
                            onClick={() => togglePendingTool(tool.name)}
                          >
                            <span className="agent-equipment__token-name">{tool.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="agent-equipment__chips">
              {(isMode ? enabledTools : (agent.defaultTools ?? [])).map((toolName) => (
                <span key={toolName} className="agent-equipment__chip">
                  {toolName.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          {toolsEditing ? (
            <button
              type="button"
              className="agent-equipment__reset-link"
              disabled={savingTools}
              onClick={() => void resetTools()}
            >
              {t('agentsOverview.equipment.reset')}
            </button>
          ) : null}
        </div>
      </section>

      {/* Skills section */}
      <section className="agent-equipment-section" aria-labelledby="agent-equipment-skills-title">
        <header className="agent-equipment-section__head">
          <div className="agent-equipment-section__titles">
            <h3
              id="agent-equipment-skills-title"
              className="agent-equipment-section__title"
            >
              {t('agentsOverview.equipment.skillsTitle')}
            </h3>
            <span className="agent-equipment-section__count">
              {`${enabledSkillKeys.length}/${modeSkills.length}`}
            </span>
          </div>
          <div className="agent-equipment-section__actions">
            {isMode && hasSkillTool ? (
              skillsEditing ? (
                <>
                  {/* Two choices while editing: keep them or drop them.
                      "Restore defaults" is a text link down in the body. */}
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={savingSkills}
                    onClick={cancelEditSkills}
                  >
                    {t('agentsOverview.equipment.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    isLoading={savingSkills}
                    onClick={() => void saveSkills()}
                  >
                    {t('agentsOverview.equipment.save')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="small"
                  disabled={savingSkills}
                  onClick={startEditSkills}
                >
                  {t('agentsOverview.equipment.edit')}
                </Button>
              )
            ) : null}
          </div>
        </header>
        <div className="agent-equipment-section__body">
          {!isMode ? (
            <p className="agent-equipment__note">
              {t('agentsOverview.equipment.nonModeSkillsNote')}
            </p>
          ) : savingSkills ? (
            <p className="agent-equipment-status agent-equipment-status--saving">
              {t('agentsOverview.equipment.saving')}
            </p>
          ) : hasSkillTool ? (
            skillsEditing ? (
              modeSkills.length === 0 ? (
                <p className="agent-equipment__note">
                  {t('agentsOverview.equipment.noSkills')}
                </p>
              ) : (
                <div className="agent-equipment__groups">
                  {editableSkillGroups.map((group) => {
                    const allEnabled = group.enabledCount === group.totalCount;
                    const someEnabled = group.enabledCount > 0;
                    return (
                      <div key={group.key} className="agent-equipment__group">
                        <div className="agent-equipment__group-head">
                          <div className="agent-equipment__group-titles">
                            <span className="agent-equipment__group-title">{group.label}</span>
                            <span className="agent-equipment__group-count">
                              {`${group.enabledCount}/${group.totalCount}`}
                            </span>
                          </div>
                          <div
                            className="agent-equipment__group-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              size="small"
                              checked={allEnabled}
                              disabled={savingSkills}
                              onChange={(e) =>
                                setPendingSkillGroupEnabled(group.skills, e.target.checked)
                              }
                              aria-label={
                                allEnabled
                                  ? t('agentsOverview.equipment.disableGroup')
                                  : t('agentsOverview.equipment.enableGroup')
                              }
                            />
                            {someEnabled && !allEnabled ? (
                              <Button
                                variant="ghost"
                                size="small"
                                disabled={savingSkills}
                                onClick={() => setPendingSkillGroupEnabled(group.skills, false)}
                              >
                                {t('agentsOverview.equipment.clearGroup')}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="agent-equipment__tokens">
                          {group.skills.map((skill) => {
                            const isOn = (pendingSkills ?? enabledSkillKeys).includes(skill.key);
                            return (
                              <button
                                key={skill.key}
                                type="button"
                                disabled={savingSkills}
                                className={`agent-equipment__token${isOn ? ' is-on' : ''}`}
                                title={getSkillTitle(skill, t, tSkills)}
                                onClick={() => togglePendingSkill(skill.key)}
                              >
                                <span className="agent-equipment__token-name">
                                  {formatSkillDisplayName(skill, duplicateSkillNames, tSkills)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : skillItems.length === 0 ? (
              <p className="agent-equipment__note">
                {t('agentsOverview.equipment.noSkills')}
              </p>
            ) : (
              <div className="agent-equipment__chips">
                {readOnlySkillGroups
                  .filter((group) => group.enabledCount > 0)
                  .map((group) => (
                    group.skills
                      .filter((skill) => skill.effectiveEnabled)
                      .map((skill) => (
                        <span
                          key={skill.key}
                          className="agent-equipment__chip"
                          title={getSkillTitle(skill, t, tSkills)}
                        >
                          {formatSkillDisplayName(skill, duplicateSkillNames, tSkills)}
                        </span>
                      ))
                  ))}
              </div>
            )
          ) : (
            <div className="agent-equipment__notice">
              <p className="agent-equipment__note">
                {t('agentsOverview.equipment.skillToolNote')}
              </p>
              <Button
                variant="secondary"
                size="small"
                disabled={savingSkills}
                onClick={() => void enableSkillTool()}
              >
                {t('agentsOverview.equipment.enableSkillTool')}
              </Button>
            </div>
          )}
          {skillsEditing ? (
            <button
              type="button"
              className="agent-equipment__reset-link"
              disabled={savingSkills}
              onClick={() => void resetSkills()}
            >
              {t('agentsOverview.equipment.reset')}
            </button>
          ) : null}
        </div>
      </section>

      {/* Subagents section */}
      <section className="agent-equipment-section" aria-labelledby="agent-equipment-subagents-title">
        <header className="agent-equipment-section__head">
          <div className="agent-equipment-section__titles">
            <h3
              id="agent-equipment-subagents-title"
              className="agent-equipment-section__title"
            >
              {t('agentsOverview.equipment.subagentsTitle')}
            </h3>
            <span className="agent-equipment-section__count">
              {`${enabledSubagentKeys.length}/${manageableSubagents.length}`}
            </span>
          </div>
          <div className="agent-equipment-section__actions">
            {isMode && hasTaskTool ? (
              subagentsEditing ? (
                <>
                  {/* Two choices while editing: keep them or drop them.
                      "Restore defaults" is a text link down in the body. */}
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={savingSubagents}
                    onClick={cancelEditSubagents}
                  >
                    {t('agentsOverview.equipment.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    isLoading={savingSubagents}
                    onClick={() => void saveSubagents()}
                  >
                    {t('agentsOverview.equipment.save')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="small"
                  disabled={savingSubagents}
                  onClick={startEditSubagents}
                >
                  {t('agentsOverview.equipment.edit')}
                </Button>
              )
            ) : null}
          </div>
        </header>
        <div className="agent-equipment-section__body">
          {!isMode ? (
            <p className="agent-equipment__note">
              {t('agentsOverview.equipment.nonModeSubagentsNote')}
            </p>
          ) : savingSubagents ? (
            <p className="agent-equipment-status agent-equipment-status--saving">
              {t('agentsOverview.equipment.saving')}
            </p>
          ) : hasTaskTool ? (
            manageableSubagents.length === 0 ? (
              <p className="agent-equipment__note">
                {t('agentsOverview.equipment.noSubagents')}
              </p>
            ) : subagentsEditing ? (
              <div className="agent-equipment__tokens">
                {manageableSubagents.map((subagent) => {
                  const isOn = (
                    pendingSubagentKeys ?? enabledSubagentKeys
                  ).includes(subagent.key);
                  return (
                    <button
                      key={subagent.key}
                      type="button"
                      disabled={savingSubagents}
                      className={`agent-equipment__token${isOn ? ' is-on' : ''}`}
                      title={subagentPresentation(subagent, t).description}
                      onClick={() => togglePendingSubagent(subagent.key)}
                    >
                      <span className="agent-equipment__token-name">
                        {subagentPresentation(subagent, t).displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : enabledSubagents.length === 0 ? (
              <p className="agent-equipment__note">
                {t('agentsOverview.equipment.noSubagents')}
              </p>
            ) : (
              <div className="agent-equipment__chips">
                {enabledSubagents.map((subagent) => (
                  <span
                    key={subagent.key}
                    className="agent-equipment__chip"
                    title={subagentPresentation(subagent, t).description}
                  >
                    {subagentPresentation(subagent, t).displayName}
                  </span>
                ))}
              </div>
            )
          ) : (
            <div className="agent-equipment__notice">
              <p className="agent-equipment__note">
                {t('agentsOverview.equipment.taskToolNote')}
              </p>
              <Button
                variant="secondary"
                size="small"
                disabled={savingSubagents}
                onClick={() => void enableTaskTool()}
              >
                {t('agentsOverview.equipment.enableTaskTool')}
              </Button>
            </div>
          )}
          {subagentsEditing ? (
            <button
              type="button"
              className="agent-equipment__reset-link"
              disabled={savingSubagents}
              onClick={() => void resetSubagents()}
            >
              {t('agentsOverview.equipment.reset')}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default AgentEquipmentPanel;
