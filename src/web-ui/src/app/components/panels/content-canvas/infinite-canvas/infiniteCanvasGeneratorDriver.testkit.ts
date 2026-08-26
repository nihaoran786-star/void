/**
 * Test-only driver for the card-anchored generator (visual language §6).
 *
 * Starting a generation used to mean "click the generate button on the card".
 * The card face has no controls any more: a generation is started by selecting
 * the card and pressing send in the generator that floats under it. Every
 * panel test that needs a live generation goes through here, so the next
 * presentation change is one edit, not ten.
 *
 * Not imported by any production module.
 */
import { act } from 'react';
import { Simulate } from 'react-dom/test-utils';

/**
 * §8: the four "new card" entries left the top toolbar row for the floating
 * rail's `+` menu. This opens that menu (if it is closed) and clicks the entry
 * whose label matches.
 */
export async function clickCanvasCreateMenuItem(
  container: ParentNode,
  label: string,
): Promise<void> {
  if (!container.querySelector('[data-canvas-rail-menu="create"]')) {
    const plus = container.querySelector<HTMLButtonElement>(
      '[data-canvas-rail-action="new"]',
    );
    if (!plus) throw new Error('no rail create button');
    await act(async () => {
      Simulate.click(plus);
    });
  }
  const item = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.infinite-canvas-rail__menu-item'),
  ).find(candidate => candidate.textContent?.includes(label));
  if (!item) throw new Error(`no create menu entry for ${label}`);
  await act(async () => {
    Simulate.click(item);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** Mirrors reactflow's selection callback into the panel. */
export async function selectCanvasCards(
  flow: { props: { onSelectionChange?: (selection: { nodes: { id: string }[] }) => void } },
  nodeIds: readonly string[],
): Promise<void> {
  await act(async () => {
    flow.props.onSelectionChange?.({ nodes: nodeIds.map(id => ({ id })) });
    await Promise.resolve();
  });
}

/**
 * Selects `nodeId` and presses one of the generator bottom bar's popover
 * triggers. §7.3-A gave the model list and the parameters separate triggers, so
 * a test that wants the model list has to press the model name.
 */
export async function openCanvasGeneratorPopover(
  container: ParentNode,
  flow: { props: { onSelectionChange?: (selection: { nodes: { id: string }[] }) => void } },
  nodeId: string,
  action: 'model' | 'params',
): Promise<void> {
  await selectCanvasCards(flow, [nodeId]);
  const trigger = container.querySelector<HTMLButtonElement>(
    `[data-canvas-generator-target="${nodeId}"] [data-canvas-generator-action="${action}"]`,
  );
  if (!trigger) throw new Error(`no generator ${action} trigger for ${nodeId}`);
  await act(async () => {
    Simulate.click(trigger);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/**
 * Selects `nodeId` and presses the send button of the generator that floats
 * under it. The generator adopts that card's stored prompt, so a seeded card
 * dispatches exactly what the card carries — the same input the old on-card
 * generate button used.
 */
export async function generateFromCanvasGenerator(
  container: ParentNode,
  flow: { props: { onSelectionChange?: (selection: { nodes: { id: string }[] }) => void } },
  nodeId: string,
): Promise<void> {
  await selectCanvasCards(flow, [nodeId]);
  const send = container.querySelector<HTMLButtonElement>(
    `[data-canvas-generator-target="${nodeId}"] [data-canvas-generator-action="send"]`,
  );
  if (!send) throw new Error(`no generator send button for ${nodeId}`);
  if (send.disabled) throw new Error(`generator send is disabled for ${nodeId}`);
  await act(async () => {
    Simulate.click(send);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
