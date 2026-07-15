import React from 'react';
import { NurseryView } from './views';
import './ProfileScene.scss';

interface ProfileSceneProps {
  /** Legacy prop – preserved for compatibility; nursery manages its own navigation */
  workspacePath?: string;
  /** Pauses retained presentation subscriptions while this scene is hidden. */
  isActive?: boolean;
}

const ProfileScene: React.FC<ProfileSceneProps> = ({ isActive = true }) => (
  <div className="void-profile-scene">
    <NurseryView isActive={isActive} />
  </div>
);

export default ProfileScene;
