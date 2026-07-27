// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import { useContextStore } from '@/shared/stores/contextStore';
import type { ContextItem } from '@/shared/types/context';
import {
  useComposerContexts,
  type ComposerContextController,
} from './useComposerContexts';

const fileContext = (id: string): ContextItem => ({
  id,
  type: 'file',
  filePath: `D:/workspace/${id}.ts`,
  fileName: `${id}.ts`,
  timestamp: 1,
});

describe('useComposerContexts', () => {
  let container: HTMLDivElement;
  let root: Root;
  let primary: ComposerContextController;
  let child: ComposerContextController;

  const Harness = ({ childComposer }: { childComposer: boolean }) => {
    const controller = useComposerContexts(childComposer);
    if (childComposer) {
      child = controller;
    } else {
      primary = controller;
    }
    return null;
  };

  beforeEach(() => {
    useContextStore.getState().clearContexts();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    act(() => {
      root.render(
        <>
          <Harness childComposer={false} />
          <Harness childComposer />
        </>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useContextStore.getState().clearContexts();
  });

  it('keeps child references independent from the existing primary context store', () => {
    act(() => {
      primary.addContext(fileContext('main'));
      child.addContext(fileContext('child'));
    });

    expect(primary.contexts.map(context => context.id)).toEqual(['main']);
    expect(child.contexts.map(context => context.id)).toEqual(['child']);
    expect(useContextStore.getState().contexts.map(context => context.id))
      .toEqual(['main']);

    act(() => {
      child.replaceContexts([fileContext('child-restored')]);
      primary.removeContext('main');
    });

    expect(primary.contexts).toEqual([]);
    expect(child.contexts.map(context => context.id)).toEqual(['child-restored']);
  });
});
