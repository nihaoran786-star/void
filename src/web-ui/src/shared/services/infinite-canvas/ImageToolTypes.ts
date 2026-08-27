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
export const MASK_IMAGE_TOOL_IDS = ['inpaint', 'erase'] as const;

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
