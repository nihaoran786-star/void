/**
 * Image tool contract (K0-2 of the Infinite Canvas & Media Tools
 * specification, docs/features/infinite-canvas-and-media-tools-prd.md §3).
 *
 * Phase 1 ships the typed contract and an explicit `unavailable` placeholder
 * only: no provider clients, no credentials, no network calls. Tool semantics
 * are absorbed from the MIT-licensed kunpeng `imageTools.ts` definitions
 * (idea only, code rewritten; see /THIRD-PARTY-NOTICES.md), including the
 * derive-new-node-never-overwrite invariant.
 */

export type ImageToolId = 'upscale' | 'expand' | 'inpaint' | 'erase' | 'matting';

export interface ImageToolDefinition {
  toolId: ImageToolId;
  /** i18n key; the UI never hardcodes tool copy. */
  labelKey: string;
  /** Prefilled instruction; 【】 placeholders await user completion. */
  instructionTemplate: string;
  /** Advisory only; never binds a provider. */
  engineHint?: string;
  /** Whether the tool may run without confirmation. Always false in phase 1. */
  autoRun: boolean;
}

export type ImageToolErrorKind =
  | 'unavailable'
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'invalid-input'
  | 'backend'
  | 'cancelled';

export interface ImageToolResult {
  /** Idempotent operation ID: re-submitting it must not execute twice. */
  operationId: string;
  status: 'succeeded' | 'failed';
  error?: { kind: ImageToolErrorKind; message: string };
  /**
   * ID of the newly derived node on success. Every image operation derives a
   * new version node; the source node and its mediaRef are never modified.
   */
  derivedNodeId?: string;
}

export interface ImageToolInvocation {
  operationId: string;
  toolId: ImageToolId;
  sourceNodeId: string;
}

export interface ImageToolGateway {
  invoke(invocation: ImageToolInvocation): Promise<ImageToolResult>;
}

// —— P5: the mask (red-mark) lane ————————————————————————————————————————————
//
// Two of the five tools stop using the plain instruction dialog and go through
// the mask editor instead: the user paints over the region, the front end burns
// those marks into a copy of the picture, and THAT composite is the reference
// the model receives (PRD §3.7).
//
// There is no mask parameter anywhere in this product's image pipeline and
// none is being added: `GenerateImage` accepts a prompt and reference images,
// full stop. The wording below therefore has to do the locating work, which is
// probabilistic — copy for this lane says "marked area", never "precise mask"
// or "pixel-level".

/** The two tools whose entry point is the mask editor. */
const MASK_IMAGE_TOOL_IDS = ['inpaint', 'erase'] as const;

export type MaskImageToolId = typeof MASK_IMAGE_TOOL_IDS[number];

export function isMaskImageTool(toolId: ImageToolId): toolId is MaskImageToolId {
  return (MASK_IMAGE_TOOL_IDS as readonly ImageToolId[]).includes(toolId);
}

/**
 * i18n key of the directive that explains the red marks to the model. Source
 * carries the key only — the sentence itself lives in the three locale files.
 */
export function maskDirectiveKey(toolId: MaskImageToolId): string {
  return `infiniteCanvas.mask.directive.${toolId}`;
}

/** i18n key of the placeholder-bearing instruction the editor prefills. */
export function maskPrefillKey(toolId: MaskImageToolId): string {
  return `infiniteCanvas.mask.prefill.${toolId}`;
}

/**
 * A complete 【…】 placeholder token. Deliberately the whole pair, never one
 * bracket: P5 review P16: the old `/[【】]/` fired on a *single* lenticular
 * bracket, so a Chinese-writing owner who used 【】 as ordinary emphasis had
 * the confirm button silently greyed out with nothing on screen saying why.
 */
const INSTRUCTION_PLACEHOLDER_ALL = /【[^【】]*】/g;
/** Separate non-global twin: `RegExp.test` on a `/g` pattern is stateful. */
const INSTRUCTION_PLACEHOLDER_ONE = /【[^【】]*】/;

/** Every placeholder token a template carries, de-duplicated. */
export function instructionPlaceholders(template: string): string[] {
  return Array.from(new Set(template.match(INSTRUCTION_PLACEHOLDER_ALL) ?? []));
}

/**
 * Whether an instruction still carries an unfilled 【】 placeholder.
 *
 * The single definition of that check: the tool instruction dialog and the
 * mask editor both prefill a template and both refuse to submit until the user
 * has replaced every placeholder, and two copies of the pattern would be two
 * chances to disagree.
 *
 * When the prefilled `template` is passed (both callers do), the check is
 * exact: only the tokens that template actually shipped count as unfilled. Any
 * other use of 【】 is the user's own prose and must not block them. Without a
 * template the check falls back to "any complete placeholder token".
 */
export function hasUnfilledInstructionPlaceholder(value: string, template?: string): boolean {
  if (template === undefined) return INSTRUCTION_PLACEHOLDER_ONE.test(value);
  return instructionPlaceholders(template).some(token => value.includes(token));
}

/**
 * Why an instruction cannot be submitted yet, as an i18n key suffix — or
 * `undefined` when it can. §7 of the visual language: a disabled control must
 * be able to say what would enable it.
 */
export type InstructionBlockReason = 'empty' | 'placeholder';

export function instructionBlockReason(
  value: string,
  template?: string,
): InstructionBlockReason | undefined {
  if (value.trim().length === 0) return 'empty';
  if (hasUnfilledInstructionPlaceholder(value, template)) return 'placeholder';
  return undefined;
}

/**
 * The prompt the mask lane submits: the directive first, then the user's own
 * sentence. It is handed to the SAME `buildFinalInstruction` every other lane
 * uses (which appends the reference table and the style block), so the two
 * paths can never drift into two prompt assemblers.
 */
export function buildMaskInstruction(directive: string, userInstruction: string): string {
  const user = userInstruction.trim();
  const lead = directive.trim();
  if (!lead) return user;
  if (!user) return lead;
  return `${lead}\n\n${user}`;
}

/** The five phase-1 tools, in menu order. */
export const IMAGE_TOOL_DEFINITIONS: readonly ImageToolDefinition[] = [
  {
    toolId: 'upscale',
    labelKey: 'infiniteCanvas.tools.upscale',
    instructionTemplate: 'Upscale this image to 【target resolution】 while preserving detail.',
    autoRun: false,
  },
  {
    toolId: 'expand',
    labelKey: 'infiniteCanvas.tools.expand',
    instructionTemplate: 'Expand the canvas towards 【direction】 and fill it with 【scene description】.',
    autoRun: false,
  },
  {
    toolId: 'inpaint',
    labelKey: 'infiniteCanvas.tools.inpaint',
    instructionTemplate: 'Repaint the selected region as 【replacement content】.',
    autoRun: false,
  },
  {
    toolId: 'erase',
    labelKey: 'infiniteCanvas.tools.erase',
    instructionTemplate: 'Erase 【object to remove】 and reconstruct the background.',
    autoRun: false,
  },
  {
    toolId: 'matting',
    labelKey: 'infiniteCanvas.tools.matting',
    instructionTemplate: 'Cut out 【subject】 with a transparent background.',
    autoRun: false,
  },
];

// —— P6: the outpainting (expand) lane ———————————————————————————————————————
//
// Expand is the third board-filling editor. Like the mask lane it changes only
// WHICH picture travels with the request — the front end composites the
// original onto a larger, otherwise transparent canvas and submits THAT as the
// edit target. `GenerateImage` still sees "a prompt and one reference image".
//
// The frame says HOW MUCH room to make. What goes in it is the user's to
// describe if they want to (§7.4.4, owner 2026-08-28: "然后下面再打字"): the
// editor keeps the shared input's writing area, and whatever is in it fills the
// existing `expand` template's "scene description" placeholder. Leave it empty
// and the template falls back to "more of what is already there", which is what
// outpainting means when nobody says otherwise. Either way it is the same
// template and the same assembler — no second prompt path.

/** How far the frame was dragged past each edge, in the picture's own pixels. */
export interface CanvasExpandInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** i18n key of the directive that explains the transparent margin to the model. */
export const EXPAND_DIRECTIVE_KEY = 'infiniteCanvas.expand.directive';

/**
 * What fills the template's "scene description" placeholder when the user
 * wrote nothing: the one thing outpainting always wants.
 */
const EXPAND_SCENE_DESCRIPTION = 'content that continues the existing scene naturally';

/** English side names, in reading order; these travel to the model, not to the UI. */
const EXPAND_SIDE_NAMES = ['top', 'right', 'bottom', 'left'] as const;

/**
 * What fills the template's "direction" placeholder: the sides the frame was
 * actually dragged out on, in reading order.
 */
export function expandInstructionDirection(insets: CanvasExpandInsets): string {
  const sides = [
    insets.top > 0 ? EXPAND_SIDE_NAMES[0] : undefined,
    insets.right > 0 ? EXPAND_SIDE_NAMES[1] : undefined,
    insets.bottom > 0 ? EXPAND_SIDE_NAMES[2] : undefined,
    insets.left > 0 ? EXPAND_SIDE_NAMES[3] : undefined,
  ].filter((side): side is typeof EXPAND_SIDE_NAMES[number] => side !== undefined);
  if (sides.length === EXPAND_SIDE_NAMES.length) return 'all four sides';
  if (sides.length === 0) return 'no side';
  if (sides.length === 1) return `the ${sides[0]}`;
  return `the ${sides.slice(0, -1).join(', ')} and ${sides[sides.length - 1]}`;
}

/**
 * The prompt the expand lane submits: the directive that explains the
 * transparent margin, then the existing `expand` template with both of its
 * placeholders filled from the frame.
 *
 * The placeholder tokens are read OUT of the template rather than written here,
 * so this file stays free of bracket literals and a template edit cannot
 * silently leave a placeholder unfilled.
 */
export function buildExpandInstruction(
  directive: string,
  insets: CanvasExpandInsets,
  sceneDescription = '',
): string {
  const definition = IMAGE_TOOL_DEFINITIONS.find(entry => entry.toolId === 'expand');
  const template = definition?.instructionTemplate ?? '';
  const [directionToken, sceneToken] = instructionPlaceholders(template);
  // Adversarial review P4: the replacement is a FUNCTION, never a string.
  // `String.replace` reads `$&`, `$'`, `` $` `` and `$1` in a string
  // replacement, so a user who typed a `$` into the outpainting box had their
  // own sentence silently rewritten — "a $5 note" would have duplicated a
  // slice of the template into the prompt that reaches the model.
  const insert = (value: string) => () => value;
  let filled = template;
  if (directionToken) {
    filled = filled.replace(directionToken, insert(expandInstructionDirection(insets)));
  }
  // The user's own sentence when there is one; the fallback otherwise. Either
  // way the placeholder is gone, so the template can never reach a model with
  // a bracket still in it.
  const scene = sceneDescription.trim() || EXPAND_SCENE_DESCRIPTION;
  if (sceneToken) filled = filled.replace(sceneToken, insert(scene));
  // The same joiner the mask lane uses — one "directive then instruction"
  // shape for every lane that prepends a machine-facing sentence.
  return buildMaskInstruction(directive, filled);
}
