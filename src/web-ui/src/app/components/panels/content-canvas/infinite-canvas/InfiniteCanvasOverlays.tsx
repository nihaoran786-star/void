/**
 * Everything the board draws on top of itself, as two dumb renderers.
 *
 * `InfiniteCanvasOverlays` is the stack that sits above the board — the notice
 * line, the two pickers, the two generation popovers and the two confirmations.
 * `InfiniteCanvasBoardOverlays` is the furniture drawn ON the board: the zoom
 * corner, the alignment guides, the left rail, the selection bar, the task
 * queue, the card-anchored generator, the right-click menu and the empty line.
 *
 * Neither decides anything. Every question — may this card be outpainted? is
 * this press a tool or a generation? should this surface be open at all? — is
 * answered in the panel and arrives here as a prop that is already true or
 * already false. Splitting the render was only worth doing on that condition:
 * a presentation file that quietly re-derives a rule is a second copy of it.
 */
import React from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';

import type {
  InfiniteCanvasDeletionSummary,
  InfiniteCanvasGenerationTask,
} from './infiniteCanvasPanelModel';
import type { InfiniteCanvasGenerationParams } from '@/shared/services/infinite-canvas';
import type { StylePresetCatalog } from '@/shared/services/style-preset';
import type {
  WorkspaceMediaLibraryService,
} from '@/shared/services/workspace-media/WorkspaceMediaTypes';

import {
  InfiniteCanvasDeleteConfirmDialog,
  InfiniteCanvasRetryCancelledDialog,
} from './InfiniteCanvasConfirmDialog';
import {
  InfiniteCanvasContextMenu,
  type InfiniteCanvasContextMenuAction,
  type InfiniteCanvasContextMenuState,
} from './InfiniteCanvasContextMenu';
import {
  InfiniteCanvasGenerator,
  type InfiniteCanvasGeneratorReference,
  type InfiniteCanvasGeneratorTarget,
} from './InfiniteCanvasGenerator';
import { InfiniteCanvasHelperLines } from './InfiniteCanvasHelperLinesOverlay';
import { InfiniteCanvasImagePicker } from './InfiniteCanvasImagePicker';
import { InfiniteCanvasModelPopover } from './InfiniteCanvasModelPopover';
import type {
  InfiniteCanvasImagePreviewResolver,
  InfiniteCanvasMediaRef,
} from './InfiniteCanvasNodes';
import { InfiniteCanvasParamsPopover } from './InfiniteCanvasParamsPopover';
import { InfiniteCanvasRail } from './InfiniteCanvasRail';
import {
  InfiniteCanvasSelectionToolbar,
  type InfiniteCanvasSelectionAction,
} from './InfiniteCanvasSelectionToolbar';
import { InfiniteCanvasStylePicker } from './InfiniteCanvasStylePicker';
import { InfiniteCanvasTaskQueuePanel } from './InfiniteCanvasTaskQueuePanel';
import type { CanvasGenerationNotice } from './useCanvasGenerationDispatch';
import type { CanvasPopoverSurface } from './useCanvasPopovers';

export interface InfiniteCanvasOverlaysProps {
  t: (key: string) => string;
  notice: CanvasGenerationNotice | null;
  onDismissNotice: () => void;

  imagePickerOpen: boolean;
  workspacePath: string;
  mediaLibrary: WorkspaceMediaLibraryService;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;
  imagePickerAnchor: HTMLElement | null;
  onPickImage: (mediaRef: InfiniteCanvasMediaRef) => void;
  onCloseImagePicker: () => void;

  /** Null while no card's style picker is open. */
  stylePickerNodeId: string | null;
  stylePickerPresetId: string | undefined;
  catalog: StylePresetCatalog;
  stylePickerAnchor: HTMLElement | null;
  onPickStyle: (presetId: string | undefined) => void;
  onCloseStylePicker: () => void;

  paramsPopover: CanvasPopoverSurface;
  modelPopover: CanvasPopoverSurface;
  onChangeGenerationParams: (params: InfiniteCanvasGenerationParams) => void;
  onChangeGenerationModel: (params: InfiniteCanvasGenerationParams) => void;

  deleteRequest: InfiniteCanvasDeletionSummary | null;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;

  /** P4 review C3: the card whose retry is waiting for "yes, charge me again". */
  retryConfirmNodeId: string | null;
  onConfirmRetry: () => void;
  onCancelRetry: () => void;
}

export const InfiniteCanvasOverlays: React.FC<InfiniteCanvasOverlaysProps> = ({
  t,
  notice,
  onDismissNotice,
  imagePickerOpen,
  workspacePath,
  mediaLibrary,
  resolvePreviewUrl,
  imagePickerAnchor,
  onPickImage,
  onCloseImagePicker,
  stylePickerNodeId,
  stylePickerPresetId,
  catalog,
  stylePickerAnchor,
  onPickStyle,
  onCloseStylePicker,
  paramsPopover,
  modelPopover,
  onChangeGenerationParams,
  onChangeGenerationModel,
  deleteRequest,
  onConfirmDelete,
  onCancelDelete,
  retryConfirmNodeId,
  onConfirmRetry,
  onCancelRetry,
}) => (
  <>
    {notice ? (
      <div
        className="infinite-canvas-panel__tool-notice"
        // A busy notice is a status, not an alert: it must not interrupt a
        // screen reader mid-sentence the way a failure legitimately does.
        role={notice.busy ? 'status' : 'alert'}
        data-error-kind={notice.errorKind}
        data-notice-busy={notice.busy ? 'true' : undefined}
        aria-busy={notice.busy || undefined}
      >
        <strong>{t('infiniteCanvas.generation.noticeTitle')}</strong>
        <span>{t(notice.messageKey)}</span>
        <button
          type="button"
          className="infinite-canvas-panel__tool-notice-dismiss"
          onClick={onDismissNotice}
        >
          {t('infiniteCanvas.tools.dismiss')}
        </button>
      </div>
    ) : null}
    {imagePickerOpen ? (
      <InfiniteCanvasImagePicker
        workspacePath={workspacePath}
        mediaLibrary={mediaLibrary}
        // The bug the owner hit: the picker used the library's
        // convertFileSrc thumbnails, which this app's webview refuses. It
        // now shares the cards' forceDataUrl resolver.
        resolvePreviewUrl={resolvePreviewUrl}
        anchor={imagePickerAnchor}
        onPick={onPickImage}
        onClose={onCloseImagePicker}
      />
    ) : null}
    {stylePickerNodeId ? (
      <InfiniteCanvasStylePicker
        currentPresetId={stylePickerPresetId}
        catalog={catalog}
        anchor={stylePickerAnchor}
        onPick={onPickStyle}
        onClose={onCloseStylePicker}
      />
    ) : null}
    {paramsPopover.target ? (
      <InfiniteCanvasParamsPopover
        mediaKind={paramsPopover.target.mediaKind}
        params={paramsPopover.target.params}
        anchor={paramsPopover.anchor}
        onChange={onChangeGenerationParams}
        onClose={paramsPopover.close}
      />
    ) : null}
    {modelPopover.target ? (
      <InfiniteCanvasModelPopover
        mediaKind={modelPopover.target.mediaKind}
        params={modelPopover.target.params}
        anchor={modelPopover.anchor}
        onChange={onChangeGenerationModel}
        onClose={modelPopover.close}
      />
    ) : null}
    {deleteRequest ? (
      <InfiniteCanvasDeleteConfirmDialog
        summary={deleteRequest}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    ) : null}
    {retryConfirmNodeId ? (
      <InfiniteCanvasRetryCancelledDialog
        nodeId={retryConfirmNodeId}
        onConfirm={onConfirmRetry}
        onCancel={onCancelRetry}
      />
    ) : null}
  </>
);

InfiniteCanvasOverlays.displayName = 'InfiniteCanvasOverlays';

/**
 * §6: the card-anchored generator, already decided upon.
 *
 * `undefined` means "no input surface anywhere on the board" — because nothing
 * is selected, because the selection is not a generation card, because the card
 * has not been measured yet, or because a board-filling editor has the same
 * generator mounted inside it. The panel works out which; this file only draws.
 */
export interface InfiniteCanvasBoardGenerator {
  target: InfiniteCanvasGeneratorTarget;
  placement: { left: number; top: number; width: number; measured: boolean };
  /**
   * §7.4.3: present only while this card is carrying a prefilled tool
   * instruction; it is what lets the box say "there is still a 【】 to fill in"
   * on its own grey line instead of in a dialog.
   */
  instructionTemplate: string | undefined;
  references: InfiniteCanvasGeneratorReference[];
  onSubmit: (prompt: string) => void;
  onCommitPrompt: (prompt: string) => void;
  onDraftChange: (prompt: string) => void;
  onAddReference: (anchor?: HTMLElement) => void;
  onRemoveReference: (sourceNodeId: string) => void;
  onOpenParams: (anchor?: HTMLElement) => void;
  onOpenModel: (anchor?: HTMLElement) => void;
  /** Absent on a video card: there is no style preset lane for video. */
  onOpenStyle?: (anchor?: HTMLElement) => void;
}

export interface InfiniteCanvasBoardOverlaysProps {
  t: (key: string) => string;
  resolvePreviewUrl: InfiniteCanvasImagePreviewResolver;

  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;

  helperLines: { vertical?: number; horizontal?: number };

  onAddText: () => void;
  onAddImage: (anchor?: HTMLElement) => void;
  onAddGenerationCard: () => void;
  onAddVideoCard: () => void;
  onOpenLibrary: (anchor?: HTMLElement) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  /** The selection bar shows itself from two cards up; the panel decides. */
  selectionToolbarNodeIds: string[] | null;
  selectionToolbarContainerRef: React.RefObject<HTMLDivElement | null>;
  onSelectionToolbarAction: (action: InfiniteCanvasSelectionAction) => void;

  tasks: InfiniteCanvasGenerationTask[];
  onRetryTask: (nodeId: string) => void;
  onRetryAllFailed: () => void;
  onStopWaiting: (operationId: string) => void;
  onLocateNode: (nodeId: string) => void;

  generator: InfiniteCanvasBoardGenerator | undefined;

  contextMenu: InfiniteCanvasContextMenuState | null;
  canPaste: boolean;
  onContextMenuAction: (action: InfiniteCanvasContextMenuAction) => void;
  onCloseContextMenu: () => void;

  /** §9: an empty board says one short grey line and nothing else. */
  isEmpty: boolean;
}

export const InfiniteCanvasBoardOverlays: React.FC<InfiniteCanvasBoardOverlaysProps> = ({
  t,
  resolvePreviewUrl,
  onZoomIn,
  onZoomOut,
  onFitView,
  helperLines,
  onAddText,
  onAddImage,
  onAddGenerationCard,
  onAddVideoCard,
  onOpenLibrary,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  selectionToolbarNodeIds,
  selectionToolbarContainerRef,
  onSelectionToolbarAction,
  tasks,
  onRetryTask,
  onRetryAllFailed,
  onStopWaiting,
  onLocateNode,
  generator,
  contextMenu,
  canPaste,
  onContextMenuAction,
  onCloseContextMenu,
  isEmpty,
}) => (
  <>
    {/*
      §8.1: reactflow's stacked `+ − ⛶` control block is replaced by three
      hairline icon buttons in the corner — no background until hovered,
      same weight as the left rail. They drive the same instance methods
      the default control block called.
    */}
    <div
      className="infinite-canvas-zoom"
      role="group"
      data-canvas-zoom="root"
      aria-label={t('infiniteCanvas.zoom.label')}
    >
      <button
        type="button"
        className="infinite-canvas-zoom__button"
        data-canvas-zoom-action="in"
        aria-label={t('infiniteCanvas.zoom.in')}
        title={t('infiniteCanvas.zoom.in')}
        onClick={onZoomIn}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="infinite-canvas-zoom__button"
        data-canvas-zoom-action="out"
        aria-label={t('infiniteCanvas.zoom.out')}
        title={t('infiniteCanvas.zoom.out')}
        onClick={onZoomOut}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="infinite-canvas-zoom__button"
        data-canvas-zoom-action="fit"
        aria-label={t('infiniteCanvas.zoom.fit')}
        title={t('infiniteCanvas.zoom.fit')}
        onClick={onFitView}
      >
        <Maximize size={14} aria-hidden="true" />
      </button>
    </div>
    <InfiniteCanvasHelperLines
      vertical={helperLines.vertical}
      horizontal={helperLines.horizontal}
    />
    {/* §8: the floating left rail replaces the old top toolbar row. */}
    <InfiniteCanvasRail
      onAddText={onAddText}
      onAddImage={onAddImage}
      onAddGenerationCard={onAddGenerationCard}
      onAddVideoCard={onAddVideoCard}
      onOpenLibrary={onOpenLibrary}
      onUndo={onUndo}
      onRedo={onRedo}
      canUndo={canUndo}
      canRedo={canRedo}
      undoHint={t('infiniteCanvas.history.undoHint')}
      redoHint={t('infiniteCanvas.history.redoHint')}
    />
    {selectionToolbarNodeIds ? (
      <InfiniteCanvasSelectionToolbar
        nodeIds={selectionToolbarNodeIds}
        containerRef={selectionToolbarContainerRef}
        onAction={onSelectionToolbarAction}
      />
    ) : null}
    <InfiniteCanvasTaskQueuePanel
      tasks={tasks}
      onRetry={onRetryTask}
      onRetryAllFailed={onRetryAllFailed}
      onStopWaiting={onStopWaiting}
      onLocate={onLocateNode}
    />
    {/*
      §6: the generator belongs to the selected card and floats under it.
      No selection, no input surface anywhere on the board.
    */}
    {/*
      While a board-filling editor is open the SAME generator is mounted
      inside it (owner, 2026-08-27), so the card-anchored one steps aside:
      two prompt boxes for one card is exactly the confusion the shared
      input was meant to remove.
    */}
    {generator ? (
      <InfiniteCanvasGenerator
        target={generator.target}
        placement={generator.placement}
        instructionTemplate={generator.instructionTemplate}
        references={generator.references}
        resolvePreviewUrl={resolvePreviewUrl}
        onSubmit={generator.onSubmit}
        onCommitPrompt={generator.onCommitPrompt}
        onDraftChange={generator.onDraftChange}
        onAddReference={generator.onAddReference}
        onRemoveReference={generator.onRemoveReference}
        onOpenParams={generator.onOpenParams}
        onOpenModel={generator.onOpenModel}
        onOpenStyle={generator.onOpenStyle}
      />
    ) : null}
    {contextMenu ? (
      <InfiniteCanvasContextMenu
        state={contextMenu}
        canPaste={canPaste}
        onAction={onContextMenuAction}
        onClose={onCloseContextMenu}
      />
    ) : null}
    {isEmpty ? (
      // §9: an empty board is the board — dark surface, the left rail, and
      // one short grey line. No illustration, no paragraph, and (§6) no
      // input box: a generator needs a card to belong to.
      <p className="infinite-canvas-panel__empty">{t('infiniteCanvas.empty.hint')}</p>
    ) : null}
  </>
);

InfiniteCanvasBoardOverlays.displayName = 'InfiniteCanvasBoardOverlays';
