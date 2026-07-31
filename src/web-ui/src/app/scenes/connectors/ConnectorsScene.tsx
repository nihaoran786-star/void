import React from 'react';
import McpToolsConfig from '@/infrastructure/config/components/McpToolsConfig';
import './ConnectorsScene.scss';

/**
 * Standalone connector workspace. Runtime and persistence remain owned by the
 * existing MCP infrastructure component; this scene only selects its catalog
 * presentation.
 */
const ConnectorsScene: React.FC = () => (
  <main className="void-connectors-scene" data-testid="connectors-scene">
    <McpToolsConfig presentation="catalog" />
  </main>
);

export default ConnectorsScene;
