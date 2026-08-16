/**
 * NavTechIcons — custom circuit / scan-frame icon set for the left navigation.
 *
 * Minimal navigation design language:
 *   square line caps, hairline strokes, solid "solder joint" nodes.
 * All icons render with `stroke: currentColor` so theme tokens drive color.
 */

import React from 'react';

export interface NavTechIconProps {
  size?: number;
  className?: string;
}

const NavTechIcon: React.FC<
  NavTechIconProps & { children: React.ReactNode; strokeWidth?: number }
> = ({ size = 15, className, strokeWidth = 1.7, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="square"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** New task — scan-frame corners + plus core. */
export const NavTechPlusIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props} strokeWidth={1.9}>
    <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />
    <path d="M12 8.5v7M8.5 12h7" />
  </NavTechIcon>
);

/** Assistant — hexagon hull with a solid core and vertex solder joints. */
export const NavTechAssistantIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
    <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="2.8" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="21.2" r="1.3" fill="currentColor" stroke="none" />
  </NavTechIcon>
);

/** Automation — dashed orbit ring with a solid core and one satellite. */
export const NavTechAutomationIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <circle cx="12" cy="12" r="7.2" strokeDasharray="2.5 3.4" />
    <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="19.2" cy="12" r="1.7" fill="currentColor" stroke="none" />
  </NavTechIcon>
);

/** Extensions — two module blocks linked by pin traces with solder joints. */
export const NavTechExtensionsIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <rect x="3.5" y="3.5" width="9" height="9" />
    <rect x="12.5" y="12.5" width="8" height="8" />
    <path d="M12.5 8h2.6M8 12.5v2.6" />
    <circle cx="16.5" cy="8" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="8" cy="16.5" r="1.4" fill="currentColor" stroke="none" />
  </NavTechIcon>
);

/** Workspace — geometric folder hull with a tab notch and one solder joint. */
export const NavTechFolderIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <path d="M3.5 6.8h6.4l2.1 3h8.5v7.4h-17z" />
    <circle cx="16.9" cy="14.4" r="1.4" fill="currentColor" stroke="none" />
  </NavTechIcon>
);

/** Code session — angle brackets converging on a solid core node. */
export const NavTechCodeIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <path d="M9.2 7.5 4.7 12l4.5 4.5M14.8 7.5l4.5 4.5-4.5 4.5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </NavTechIcon>
);

/** Claw session — orb ring gripped by three solder joints, solid core. */
export const NavTechClawIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <circle cx="12" cy="12" r="6.6" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="5.4" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="6.3" cy="15.3" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="17.7" cy="15.3" r="1.4" fill="currentColor" stroke="none" />
  </NavTechIcon>
);

/** Cowork session — two tall modules linked by a horizontal trace. */
export const NavTechCoworkIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <rect x="3.5" y="6.5" width="7" height="11" />
    <rect x="13.5" y="6.5" width="7" height="11" />
    <path d="M10.5 12h3" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </NavTechIcon>
);

/** Media session — film frame with dashed sprocket rails and a play core. */
export const NavTechMediaIcon: React.FC<NavTechIconProps> = (props) => (
  <NavTechIcon {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" />
    <path d="M8 5.5v13M16 5.5v13" strokeDasharray="2 2.6" />
    <path d="M11 9.8v4.4l4-2.2z" fill="currentColor" stroke="none" />
  </NavTechIcon>
);
