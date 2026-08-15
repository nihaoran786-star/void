import { CanvasSurfaceCommandService } from '@/shared/services/canvas';

/**
 * Application-scoped command port for Canvas hosts.
 *
 * Callers submit typed surface intents here; the currently committed
 * ContentCanvas host supplies authoritative workspace routing facts.
 */
export const canvasSurfaceCommandService = new CanvasSurfaceCommandService();
