/**
 * The one floating media stage (visual language §7.4, owner's ruling
 * 2026-08-28).
 *
 * Owner: every place a picture is enlarged must float, in one style, and a
 * design that works once should be reused rather than redrawn.
 * Every place this board enlarges a picture over the canvas — the full-screen
 * viewer, the mask (inpaint / erase) editor, and the frame editor in both of
 * its directions (crop and expand) — mounts THIS component. There is no second
 * blurred plate, no second pill, no second dismissal contract.
 *
 * What the shell owns:
 *
 * - the blurred board: `backdrop-filter` over a tint taken from the canvas's
 *   OWN background token, so it is dark under the dark theme and light under
 *   the light one. Never a hard-coded black scrim.
 * - the floating pill above the media, whose leftmost item is always the `×`,
 *   cut off from the scene's own tools by a hairline.
 * - the media, floating and centred, shrink-wrapped so that everything around
 *   it is backdrop.
 * - the shared generator's slot underneath (`footer`), for the scenes that
 *   send from it.
 * - dismissal: `×`, `Escape` and a press on the blurred board all call
 *   `onClose` DIRECTLY. §7.4.2, owner: closing must not ask anything — there is
 *   no discard confirmation on any of these surfaces, because a mark or a
 *   dragged box is a draft and the original file was never touched.
 *
 * What a scene owns: what goes in the pill, what the media is, and whether
 * there is a footer at all. That is the entire allowed difference (§7.4).
 *
 * Two hard-won lessons are enforced here rather than in each scene:
 *
 * - **Measure before you show.** `ready={false}` hides the MEDIA only. The pill
 *   stays mounted, because `ready` never becomes true when a picture fails to
 *   decode, and a surface with no visible way out is not a surface.
 * - **No layout read enters the render path.** The shell places nothing from a
 *   measurement; it is ordinary centred flow.
 */
import React from 'react';
import { X } from 'lucide-react';

import {
  EDITOR_INSIDE_SELECTORS,
  useInfiniteCanvasDismiss,
} from './useInfiniteCanvasDismiss';

/** Which assembly of the one shell this is; reported as `data-canvas-stage`. */
export type InfiniteCanvasStageScene = 'viewer' | 'mask' | 'crop' | 'expand';

interface InfiniteCanvasMediaStageProps {
  scene: InfiniteCanvasStageScene;
  /** Extra root class for the scene's own rules; the shell class is always on. */
  className?: string;
  /** Accessible name of the surface. */
  label: string;
  /** Accessible name of the pill; defaults to `label`. */
  toolbarLabel?: string;
  /** The `×`'s accessible name, in the scene's own words. */
  closeLabel: string;
  /** False keeps the media hidden until its natural size is known. */
  ready?: boolean;
  /** Reported as `data-state`, for tests and for the stylesheet. */
  state?: 'loading' | 'ready' | 'failed';
  /** Further `data-*` the scene wants on the root. */
  dataAttributes?: Readonly<Record<string, string | undefined>>;
  /** The pill's contents, after the `×` and its hairline. */
  pill?: React.ReactNode;
  /** One very short line under the pill. Nothing else may go there. */
  dockNote?: React.ReactNode;
  /**
   * Loading / failure copy. A sibling of the media, never inside it: the
   * measure-before-show gate must not be able to hide the one thing on screen
   * that has something to say.
   */
  placeholder?: React.ReactNode;
  /** The shared generator, for the scenes that send from it. */
  footer?: React.ReactNode;
  /**
   * Controls that sit outside the stack (the viewer's step arrows). They are
   * declared "inside" for dismissal: pressing a control must never dismiss the
   * thing it acts on.
   */
  extras?: React.ReactNode;
  /** `×`, Escape and a press on the blurred board all land here. Directly. */
  onClose: () => void;
  /** The media itself. */
  children?: React.ReactNode;
}

export const InfiniteCanvasMediaStage: React.FC<InfiniteCanvasMediaStageProps> = ({
  scene,
  className,
  label,
  toolbarLabel,
  closeLabel,
  ready = true,
  state,
  dataAttributes,
  pill,
  dockNote,
  placeholder,
  footer,
  extras,
  onClose,
  children,
}) => {
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const footerRef = React.useRef<HTMLDivElement | null>(null);
  const extrasRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * The SURFACE is the media; everything around it is backdrop. The pill, the
   * footer and the extras are controls and are declared "inside". The popovers
   * the footer opens (parameters, model, style) mount as siblings of the whole
   * stage, which is what `EDITOR_INSIDE_SELECTORS` covers.
   */
  const mediaRef = useInfiniteCanvasDismiss<HTMLDivElement>({
    onDismiss: onClose,
    inside: [dockRef, footerRef, extrasRef],
    insideSelectors: EDITOR_INSIDE_SELECTORS,
  });

  return (
    <div
      className={`infinite-canvas-stage${className ? ` ${className}` : ''}`}
      data-canvas-stage={scene}
      data-ready={ready ? 'true' : 'false'}
      data-state={state}
      role="dialog"
      aria-label={label}
      {...dataAttributes}
    >
      {/*
        The blurred board. It carries no handler of its own: pressing it is
        "outside the media", which the shared dismiss contract already reads as
        close.
      */}
      <div
        className="infinite-canvas-editor__backdrop"
        data-canvas-stage-action="backdrop"
        aria-hidden="true"
      />
      <div className="infinite-canvas-editor__float">
        <div className="infinite-canvas-editor__dock" ref={dockRef}>
          <div
            className="infinite-canvas-editor__pill"
            role="toolbar"
            aria-label={toolbarLabel ?? label}
          >
            {/*
              §7.4: the leftmost item of the pill is always the way out, and it
              is an icon, not a word. Every scene, including the viewer.
            */}
            <button
              type="button"
              data-canvas-stage-action="close"
              aria-label={closeLabel}
              title={closeLabel}
              onClick={onClose}
            >
              <X size={14} aria-hidden="true" />
            </button>
            <span className="infinite-canvas-editor__divider" aria-hidden="true" />
            {pill}
          </div>
          {dockNote}
        </div>
        {placeholder}
        <div className="infinite-canvas-stage__media" data-canvas-stage-media ref={mediaRef}>
          {children}
        </div>
        {footer ? (
          <div className="infinite-canvas-editor__input" ref={footerRef}>
            {footer}
          </div>
        ) : null}
      </div>
      {extras ? (
        // `display: contents`: the arrows place themselves against the whole
        // surface; this wrapper exists only so dismissal can name them.
        <div className="infinite-canvas-stage__extras" ref={extrasRef}>
          {extras}
        </div>
      ) : null}
    </div>
  );
};

InfiniteCanvasMediaStage.displayName = 'InfiniteCanvasMediaStage';
