import React from 'react';
import { createPortal } from 'react-dom';

const SessionCapabilityRailTargetContext =
  React.createContext<HTMLElement | null>(null);
const SessionCapabilityRailRegisterContext =
  React.createContext<(target: HTMLElement | null) => void>(() => {});
const SessionCapabilityRailPresentationContext = React.createContext({
  isCanvasExpanded: true,
  ensureCanvasExpanded: () => {},
});

interface SessionCapabilityRailOutletProviderProps
  extends React.PropsWithChildren {
  isCanvasExpanded: boolean;
  ensureCanvasExpanded: () => void;
}

export const SessionCapabilityRailOutletProvider: React.FC<
  SessionCapabilityRailOutletProviderProps
> = ({
  children,
  isCanvasExpanded,
  ensureCanvasExpanded,
}) => {
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  const presentation = React.useMemo(() => ({
    isCanvasExpanded,
    ensureCanvasExpanded,
  }), [ensureCanvasExpanded, isCanvasExpanded]);

  return (
    <SessionCapabilityRailRegisterContext.Provider value={setTarget}>
      <SessionCapabilityRailPresentationContext.Provider value={presentation}>
        <SessionCapabilityRailTargetContext.Provider value={target}>
          {children}
        </SessionCapabilityRailTargetContext.Provider>
      </SessionCapabilityRailPresentationContext.Provider>
    </SessionCapabilityRailRegisterContext.Provider>
  );
};

export const SessionCapabilityRailOutlet: React.FC = () => {
  const registerTarget = React.useContext(
    SessionCapabilityRailRegisterContext,
  );

  return (
    <div
      ref={registerTarget}
      className="session-capability-rail__team-outlet"
      data-testid="session-capability-rail-team-outlet"
    />
  );
};

export const SessionCapabilityRailPortal: React.FC<
  React.PropsWithChildren
> = ({ children }) => {
  const target = React.useContext(SessionCapabilityRailTargetContext);
  return target ? createPortal(children, target) : children;
};

// eslint-disable-next-line react-refresh/only-export-components -- The portal target and its presentation hook share one scoped context.
export const useSessionCapabilityRailPresentation = () =>
  React.useContext(SessionCapabilityRailPresentationContext);
