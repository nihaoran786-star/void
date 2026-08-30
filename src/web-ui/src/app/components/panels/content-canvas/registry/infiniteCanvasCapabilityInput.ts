/**
 * K3 §5.1.5: the typed payload the Infinite Canvas surface accepts.
 *
 * Before K3 the surface rejected any non-empty input ("must be empty in phase
 * 1"). It now accepts exactly one extra shape — "open the board and bring this
 * short-drama asset with you" — and nothing else. Everything here is
 * fail-closed: an unknown module, an unknown asset kind, a missing idempotency
 * key or a single surplus key all come back `invalid` with a reason string.
 *
 * Deliberately absent: any file path. The board asks the short-drama side for
 * the asset's current picture after it opens; a path in the payload would be a
 * second source of truth and would send the wrong file whenever the asset
 * changed picture between the click and the open.
 */
import type { InfiniteCanvasDomainRef } from '@/shared/services/infinite-canvas/document/InfiniteCanvasTypes';
import {
  INFINITE_CANVAS_DOMAIN_KINDS,
  INFINITE_CANVAS_DOMAIN_MODULE_IDS,
  INFINITE_CANVAS_DOMAIN_ROLES,
} from '@/shared/services/infinite-canvas/document/InfiniteCanvasTypes';

/**
 * The one module allowed to write `domainRef` (contract §5.1.2). Same list the
 * document parser reads back with, so the door and the lock cannot drift.
 */
export const INFINITE_CANVAS_DOMAIN_MODULE_ID = INFINITE_CANVAS_DOMAIN_MODULE_IDS[0];

export type InfiniteCanvasDomainKind = typeof INFINITE_CANVAS_DOMAIN_KINDS[number];

/** The only role K3 defines; `'reference'` is reserved for a later phase. */
export const INFINITE_CANVAS_DOMAIN_ROLE_REFINE = INFINITE_CANVAS_DOMAIN_ROLES[0];

export interface InfiniteCanvasSurfaceInput {
  /** Absent = just open the board, exactly the pre-K3 behaviour. */
  domainRef?: InfiniteCanvasDomainRef;
  /** One-shot import key; the same requestId is only ever imported once. */
  requestId?: string;
}

export type InfiniteCanvasSurfaceInputValidation =
  | { status: 'valid'; value: InfiniteCanvasSurfaceInput }
  | { status: 'invalid'; reason: string };

const ALLOWED_INPUT_KEYS = new Set(['domainRef', 'requestId']);
const ALLOWED_DOMAIN_REF_KEYS = new Set(['moduleId', 'kind', 'id', 'role']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmedNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function invalid(reason: string): InfiniteCanvasSurfaceInputValidation {
  return { status: 'invalid', reason };
}

/**
 * Validates and normalises the surface payload. Pure: no registry, no store,
 * no workspace — the surface definition still applies its own remote
 * fail-closed `checkWorkspace` on top of this.
 */
export function validateInfiniteCanvasSurfaceInput(
  input: unknown,
): InfiniteCanvasSurfaceInputValidation {
  if (input === undefined || input === null) {
    return { status: 'valid', value: {} };
  }
  if (!isRecord(input)) {
    return invalid('Infinite Canvas surface input must be an object.');
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_INPUT_KEYS.has(key)) {
      return invalid(`Infinite Canvas surface input has an unknown key "${key}".`);
    }
  }

  const rawDomainRef = input.domainRef;
  const requestId = trimmedNonEmpty(input.requestId);

  if (rawDomainRef === undefined) {
    if (input.requestId !== undefined) {
      return invalid('Infinite Canvas surface input carries a request id without a domain reference.');
    }
    return { status: 'valid', value: {} };
  }

  if (!isRecord(rawDomainRef)) {
    return invalid('Infinite Canvas domain reference must be an object.');
  }
  for (const key of Object.keys(rawDomainRef)) {
    if (!ALLOWED_DOMAIN_REF_KEYS.has(key)) {
      return invalid(`Infinite Canvas domain reference has an unknown key "${key}".`);
    }
  }

  const moduleId = trimmedNonEmpty(rawDomainRef.moduleId);
  if (moduleId !== INFINITE_CANVAS_DOMAIN_MODULE_ID) {
    return invalid(
      `Infinite Canvas only accepts domain references from "${INFINITE_CANVAS_DOMAIN_MODULE_ID}".`,
    );
  }
  const kind = trimmedNonEmpty(rawDomainRef.kind);
  if (
    kind === undefined
    || !(INFINITE_CANVAS_DOMAIN_KINDS as readonly string[]).includes(kind)
  ) {
    return invalid('Infinite Canvas domain reference kind is not a refinable asset type.');
  }
  const id = trimmedNonEmpty(rawDomainRef.id);
  if (id === undefined) {
    return invalid('Infinite Canvas domain reference is missing its asset id.');
  }
  const role = trimmedNonEmpty(rawDomainRef.role);
  if (role !== INFINITE_CANVAS_DOMAIN_ROLE_REFINE) {
    return invalid('Infinite Canvas domain reference role is not supported.');
  }
  if (requestId === undefined) {
    return invalid('Infinite Canvas domain import requires a request id.');
  }

  return {
    status: 'valid',
    value: { domainRef: { moduleId, kind, id, role }, requestId },
  };
}

