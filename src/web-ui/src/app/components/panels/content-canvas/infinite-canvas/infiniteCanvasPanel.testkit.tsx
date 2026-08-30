/**
 * Shared test bed for the infinite canvas panel.
 *
 * Nineteen panel tests used to carry their own hand-written copy of the same
 * `@xyflow/react` stand-in and the same six-mock preamble, and then reached
 * straight into the props that stand-in captured (`flow.props.onNodesChange`,
 * `flow.props.onSelectionChange`, ...) to make things happen. That pinned the
 * panel's *internal callback wiring*, not its behaviour: moving a callback into
 * a hook turned every one of those files red.
 *
 * Everything a panel test needs from reactflow now lives here:
 *
 *   - `mockReactFlow()` — the one stand-in, with the few honest variations
 *     (does the board fold moves back in? are cards mounted or just markers?)
 *     behind named options;
 *   - `mockI18n()` / `mockPreviewResolver()` / `mockMediaLibrary()` /
 *     `mockDocumentGateway()` / `mockGenerationRuntime()` — the repeated
 *     preamble, one line per module at the top of a test file;
 *   - behaviour drivers (`dragNode`, `selectNodes`, `deleteNodes`,
 *     `connectToEmptyPane`, ...) named after what a person does on the board,
 *     so a test says what the user did and never what the panel is called
 *     internally.
 *
 * The next presentation or wiring change is one edit here, not nineteen.
 *
 * Not imported by any production module.
 */
import React, { act } from 'react';
import { vi } from 'vitest';

/* ------------------------------------------------------------------ board */

/**
 * The live board as reactflow would see it. The stand-in below writes the
 * props it was handed here on every render; the drivers read them back.
 *
 * A test file gets the same object the mock factory gets, because both go
 * through the module registry. There is no `vi.hoisted` to keep in sync.
 */
export const canvasFlow: {
  props: any;
  setCenter: any;
} = { props: null, setCenter: null };

/** Call from `beforeEach`: forgets the previous render's board. */
export function resetCanvasFlow(): void {
  canvasFlow.props = null;
  canvasFlow.setCenter = vi.fn();
}

/* ------------------------------------------------------- the one xyflow mock */

export interface MockReactFlowOptions {
  /**
   * How the stand-in folds reactflow's change list back into the node array.
   *
   *   - `'removals'` (default): drops removed cards, ignores moves — enough
   *     for tests that only care that a card left the board;
   *   - `'removals-and-moves'`: also applies new positions, for tests that
   *     read a card's position back;
   *   - `'ignored'`: the array is handed back untouched, for tests where the
   *     panel owns the node list outright.
   */
  nodeChanges?: 'ignored' | 'removals' | 'removals-and-moves';
  /**
   * The same choice for connections.
   *
   *   - `'removals'` (default): drops removed connections;
   *   - `'ignored'`: the array is handed back untouched, for tests where the
   *     panel owns the edge list outright — the counterpart of
   *     `nodeChanges: 'ignored'`.
   *
   * It exists because the two files that own their node list outright
   * (`domainref`, `writeback`) carried an identity `applyEdgeChanges` before
   * they moved here, and picked up removal-folding on the way. Neither emits
   * an edge removal today, so nothing changed — but the next edge test added
   * to them would have run against a board that behaves unlike the one they
   * were written for.
   */
  edgeChanges?: 'ignored' | 'removals';
  /**
   * What a card renders as.
   *
   *   - `'mounted'` (default): the real node component from `nodeTypes`;
   *   - `'position-markers'`: an empty div carrying `data-node-x` /
   *     `data-node-y`, for tests that only measure where cards sit.
   */
  cards?: 'mounted' | 'position-markers';
}

/**
 * The single `@xyflow/react` stand-in. Use it as a one-liner at the top of a
 * test file:
 *
 * ```ts
 * vi.mock('@xyflow/react', async () => (
 *   await import('./infiniteCanvasPanel.testkit')
 * ).mockReactFlow());
 * ```
 */
export function mockReactFlow(options: MockReactFlowOptions = {}): Record<string, unknown> {
  const nodeChanges = options.nodeChanges ?? 'removals';
  const edgeChanges = options.edgeChanges ?? 'removals';
  const cards = options.cards ?? 'mounted';

  const removed = (changes: any[], id: string): boolean => changes.some(
    change => change.type === 'remove' && change.id === id,
  );
  const movedTo = (changes: any[], id: string): { x: number; y: number } | undefined => changes
    .find(change => change.type === 'position' && change.id === id && change.position)
    ?.position;

  return {
    ReactFlow: (props: any) => {
      canvasFlow.props = props;
      // Reactflow hands the instance to onInit once it has mounted.
      const { onInit } = props;
      React.useEffect(() => {
        onInit?.({ setCenter: canvasFlow.setCenter });
      }, [onInit]);
      return React.createElement(
        'div',
        { 'data-testid': 'react-flow' },
        props.nodes.map((node: any) => {
          if (cards === 'position-markers') {
            return React.createElement('div', {
              key: node.id,
              'data-node-id': node.id,
              'data-node-x': String(node.position.x),
              'data-node-y': String(node.position.y),
            });
          }
          const NodeComponent = props.nodeTypes[node.type];
          return React.createElement(
            'div',
            { key: node.id, 'data-node-id': node.id },
            React.createElement(NodeComponent, {
              id: node.id,
              data: node.data,
              selected: false,
            }),
          );
        }),
        props.children,
      );
    },
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
    applyNodeChanges: (changes: any[], nodes: any[]) => {
      if (nodeChanges === 'ignored') return nodes;
      const kept = nodes.filter(node => !removed(changes, node.id));
      if (nodeChanges === 'removals') return kept;
      return kept.map(node => {
        const position = movedTo(changes, node.id);
        return position ? { ...node, position } : node;
      });
    },
    applyEdgeChanges: (changes: any[], edges: any[]) => (
      edgeChanges === 'ignored' ? edges : edges.filter(edge => !removed(changes, edge.id))
    ),
  };
}

/**
 * The two reactflow primitives a bare node-component test needs. No board, no
 * captured props.
 */
export function mockReactFlowPrimitives(): Record<string, unknown> {
  return {
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
  };
}

/* ------------------------------------------------- the repeated preamble */

/**
 * Keys come back untranslated. Pass `interpolates: true` when the test reads
 * the values a message was given (`key:a,b`).
 */
export function mockI18n(options: { interpolates?: boolean } = {}): Record<string, unknown> {
  if (!options.interpolates) {
    return { useI18n: () => ({ t: (key: string) => key }) };
  }
  return {
    useI18n: () => ({
      t: (key: string, values?: Record<string, unknown>) => (
        values ? `${key}:${Object.values(values).join(',')}` : key
      ),
    }),
  };
}

/** No preview is ever resolved unless a test overrides the returned spy. */
export function mockPreviewResolver(): Record<string, unknown> {
  return { resolveWorkspaceMediaPreviewUrl: vi.fn(async () => undefined) };
}

/** The workspace library is always reachable and always empty. */
export function mockMediaLibrary(): Record<string, unknown> {
  return {
    workspaceMediaLibraryService: {
      checkAvailability: async () => ({ status: 'unknown' }),
      scanLibrary: async () => ({ status: 'empty', scannedAt: 0 }),
    },
  };
}

export interface MockDocumentGatewayOptions {
  /**
   * Ports this mock deliberately does NOT export.
   *
   * `InfiniteCanvasPanel.p5.test.tsx` leans on this: with the P5 ports absent,
   * an injected port can never be resolved through the module (so no test can
   * reach a real Tauri command by accident), and a panel test written before a
   * port existed keeps working instead of crashing on the missing export. The
   * production `resolvePort()` try/catch exists for exactly this shape.
   */
  omitPorts?: readonly ('saver' | 'revealer')[];
}

/**
 * Every gateway getter throws: a test that wants a document service, a save
 * port or a reveal port has to inject one.
 */
export function mockDocumentGateway(
  options: MockDocumentGatewayOptions = {},
): Record<string, unknown> {
  const omitted = new Set(options.omitPorts ?? []);
  const gateway: Record<string, unknown> = {
    getInfiniteCanvasDocumentService: () => {
      throw new Error('Tests must inject a document service.');
    },
    // Default W7 manifest reader: nothing on disk unless a test injects one.
    getInfiniteCanvasMediaJobReader: () => ({ readTextFile: async () => null }),
  };
  if (!omitted.has('saver')) {
    gateway.getInfiniteCanvasMediaSaver = () => {
      throw new Error('Tests must inject a save port.');
    };
  }
  if (!omitted.has('revealer')) {
    gateway.getInfiniteCanvasMediaRevealer = () => {
      throw new Error('Tests must inject a reveal port.');
    };
  }
  return gateway;
}

/** A generation runtime always has to be injected by the test. */
export function mockGenerationRuntime(): Record<string, unknown> {
  return {
    createInfiniteCanvasGenerationRuntime: () => {
      throw new Error('Tests must inject a generation runtime.');
    },
  };
}

/* ------------------------------------------------------- reading the board */

/** Every card currently on the board. */
export function canvasNodes(): any[] {
  return canvasFlow.props.nodes;
}

/** Every connection currently on the board. */
export function canvasEdges(): any[] {
  return canvasFlow.props.edges;
}

/** The ids of the cards on the board, in board order. */
export function canvasNodeIds(): string[] {
  return canvasFlow.props.nodes.map((node: any) => node.id);
}

/** One card by id, or undefined when it is not on the board. */
export function canvasNode(nodeId: string): any {
  return canvasFlow.props.nodes.find((node: any) => node.id === nodeId);
}

/* ------------------------------------------------------------ user actions */

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

/** Drags one card and drops it at `position`. */
export async function dragNode(
  nodeId: string,
  position: { x: number; y: number },
  options: { dropped?: boolean } = {},
): Promise<void> {
  await dragNodes([{ id: nodeId, position }], options);
}

/**
 * Drags several cards at once. `dropped` defaults to true — the gesture has
 * finished. Pass `{ dropped: false }` for a card still under the pointer.
 */
export async function dragNodes(
  moves: readonly { id: string; position: { x: number; y: number } }[],
  options: { dropped?: boolean } = {},
): Promise<void> {
  const dragging = options.dropped === false;
  await act(async () => {
    canvasFlow.props.onNodesChange(moves.map(move => ({
      id: move.id,
      type: 'position',
      dragging,
      position: move.position,
    })));
    await settle();
  });
}

/** Presses delete on the given cards (the panel decides whether to confirm). */
export async function deleteNodes(nodeIds: readonly string[]): Promise<void> {
  await act(async () => {
    canvasFlow.props.onNodesChange(nodeIds.map(id => ({ id, type: 'remove' })));
    await settle();
  });
}

/** Selects exactly these cards; an empty list clears the selection. */
export async function selectNodes(nodeIds: readonly string[]): Promise<void> {
  await act(async () => {
    canvasFlow.props.onSelectionChange({ nodes: nodeIds.map(id => ({ id })), edges: [] });
    await settle();
  });
}

/** Selects exactly these connections and no cards. */
export async function selectEdges(edgeIds: readonly string[]): Promise<void> {
  await act(async () => {
    canvasFlow.props.onSelectionChange({ nodes: [], edges: edgeIds.map(id => ({ id })) });
    await settle();
  });
}

/** Clicks empty board: nothing is selected any more. */
export async function clearSelection(): Promise<void> {
  await selectNodes([]);
}

/** Drags a wire from one card's handle onto another card. */
export async function connectNodes(source: string, target: string): Promise<void> {
  await act(async () => {
    canvasFlow.props.onConnect({ source, target });
    await settle();
  });
}

/**
 * Drags a wire out of a card and lets go over empty board — the gesture that
 * offers to make a new card there.
 */
export async function connectToEmptyPane(
  sourceNodeId: string,
  at: { clientX: number; clientY: number },
): Promise<void> {
  await dropConnection(sourceNodeId, at, true);
}

/** Drags a wire out of a card and lets go somewhere that is not the board. */
export async function connectToNothing(
  sourceNodeId: string,
  at: { clientX: number; clientY: number },
): Promise<void> {
  await dropConnection(sourceNodeId, at, false);
}

async function dropConnection(
  sourceNodeId: string,
  at: { clientX: number; clientY: number },
  ontoPane: boolean,
): Promise<void> {
  await act(async () => {
    canvasFlow.props.onConnectStart?.({}, { nodeId: sourceNodeId, handleType: 'source' });
    canvasFlow.props.onConnectEnd?.({
      target: {
        classList: {
          contains: (name: string) => (ontoPane ? name === 'react-flow__pane' : false),
        },
      },
      clientX: at.clientX,
      clientY: at.clientY,
    });
    await settle();
  });
}

/** Finishes a pan or zoom: the board now sits at this viewport. */
export async function panViewportTo(
  viewport: { x: number; y: number; zoom: number },
): Promise<void> {
  await act(async () => {
    canvasFlow.props.onMoveEnd(undefined, viewport);
    await settle();
  });
}

function fakeMouseEvent(): any {
  return { clientX: 400, clientY: 300, preventDefault: () => undefined };
}

/** Right-clicks a card. */
export async function openNodeContextMenu(nodeId: string): Promise<void> {
  await act(async () => {
    canvasFlow.props.onNodeContextMenu(fakeMouseEvent(), { id: nodeId });
    await settle();
  });
}

/** Right-clicks empty board. */
export async function openPaneContextMenu(): Promise<void> {
  await act(async () => {
    canvasFlow.props.onPaneContextMenu(fakeMouseEvent());
    await settle();
  });
}
