import React, { createContext, useContext } from 'react';

const FlowChatPresentationActivityContext = createContext(true);

interface FlowChatPresentationActivityProviderProps {
  isActive: boolean;
  children: React.ReactNode;
}

/**
 * Presentation-only lifecycle signal for mounted FlowChat UI.
 *
 * This must never pause FlowChatManager or the legacy store. It only lets
 * mounted presentation components release subscriptions, observers, and
 * animation work while their scene is hidden.
 */
export const FlowChatPresentationActivityProvider: React.FC<FlowChatPresentationActivityProviderProps> = ({
  isActive,
  children,
}) => (
  <FlowChatPresentationActivityContext.Provider value={isActive}>
    {children}
  </FlowChatPresentationActivityContext.Provider>
);

// eslint-disable-next-line react-refresh/only-export-components -- The provider hook is intentionally colocated with its context.
export function useFlowChatPresentationActive(): boolean {
  return useContext(FlowChatPresentationActivityContext);
}
