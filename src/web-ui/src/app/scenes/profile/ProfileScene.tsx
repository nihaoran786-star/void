import React, { useMemo, useEffect } from 'react';
import { useWorkspaceContext } from '@/infrastructure/contexts/WorkspaceContext';
import { WorkspaceKind } from '@/shared/types';
import { useMyAgentStore } from '@/app/scenes/my-agent/myAgentStore';
import { NurseryView } from './views';
import './ProfileScene.scss';

interface ProfileSceneProps {
  /** Legacy prop – preserved for compatibility; nursery manages its own navigation */
  workspacePath?: string;
  /** Pauses retained presentation subscriptions while this scene is hidden. */
  isActive?: boolean;
}

const ProfileScene: React.FC<ProfileSceneProps> = ({ isActive = true }) => {
  const selectedAssistantWorkspaceId = useMyAgentStore((s) => s.selectedAssistantWorkspaceId);
  const setSelectedAssistantWorkspaceId = useMyAgentStore((s) => s.setSelectedAssistantWorkspaceId);
  const { currentWorkspace, assistantWorkspacesList } = useWorkspaceContext();
  const activeAssistantWorkspace =
    currentWorkspace?.workspaceKind === WorkspaceKind.Assistant ? currentWorkspace : null;

  const defaultAssistantWorkspace = useMemo(
    () => assistantWorkspacesList.find((workspace) => !workspace.assistantId) ?? assistantWorkspacesList[0] ?? null,
    [assistantWorkspacesList]
  );

  const selectedAssistantWorkspace = useMemo(() => {
    if (!selectedAssistantWorkspaceId) {
      return null;
    }
    return assistantWorkspacesList.find((workspace) => workspace.id === selectedAssistantWorkspaceId) ?? null;
  }, [assistantWorkspacesList, selectedAssistantWorkspaceId]);

  const resolvedAssistantWorkspace = useMemo(() => {
    if (activeAssistantWorkspace) {
      return activeAssistantWorkspace;
    }
    if (selectedAssistantWorkspace) {
      return selectedAssistantWorkspace;
    }
    return defaultAssistantWorkspace;
  }, [activeAssistantWorkspace, defaultAssistantWorkspace, selectedAssistantWorkspace]);

  useEffect(() => {
    if (activeAssistantWorkspace?.id && activeAssistantWorkspace.id !== selectedAssistantWorkspaceId) {
      setSelectedAssistantWorkspaceId(activeAssistantWorkspace.id);
    }
  }, [activeAssistantWorkspace, selectedAssistantWorkspaceId, setSelectedAssistantWorkspaceId]);

  useEffect(() => {
    const selectedExists = selectedAssistantWorkspaceId
      ? assistantWorkspacesList.some((workspace) => workspace.id === selectedAssistantWorkspaceId)
      : false;

    if (activeAssistantWorkspace?.id) {
      return;
    }

    if (!selectedExists && resolvedAssistantWorkspace?.id !== selectedAssistantWorkspaceId) {
      setSelectedAssistantWorkspaceId(resolvedAssistantWorkspace?.id ?? null);
    }
  }, [
    activeAssistantWorkspace,
    assistantWorkspacesList,
    resolvedAssistantWorkspace,
    selectedAssistantWorkspaceId,
    setSelectedAssistantWorkspaceId,
  ]);

  return (
    <div className="void-profile-scene">
      <NurseryView isActive={isActive} />
    </div>
  );
};

export default ProfileScene;
