export type E2EWorkspaceInfo = {
  rootPath: string;
};

export declare const globalStateAPI: {
  getCurrentWorkspace(): Promise<E2EWorkspaceInfo | null>;
  getOpenedWorkspaces(): Promise<E2EWorkspaceInfo[]>;
};
