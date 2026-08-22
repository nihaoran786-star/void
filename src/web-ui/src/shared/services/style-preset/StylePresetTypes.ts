/**
 * StylePreset domain contracts (K0-1 of the Infinite Canvas & Media Tools
 * specification, docs/features/infinite-canvas-and-media-tools-prd.md).
 *
 * The catalog is read-only reference data absorbed from the MIT-licensed
 * kunpeng project (see /THIRD-PARTY-NOTICES.md). Pure types only: no React,
 * Zustand, or Tauri dependencies.
 */

export type StylePresetFamily =
  | 'cinematic'
  | 'animation-2d'
  | 'midjourney'
  | 'mg-motion';

export interface StylePresetOrigin {
  project: 'kunpeng';
  license: 'MIT';
  /** Path of the source file inside the upstream kunpeng repository. */
  sourcePath: string;
}

export interface StylePreset {
  /** Stable, globally unique ID derived from the upstream source id. */
  presetId: string;
  schemaVersion: '1';
  family: StylePresetFamily;
  /** Chinese display name. */
  name: string;
  category: string;
  /** Full prompt template (style-library / midjourney families). */
  promptTemplate?: string;
  /** Short prompt (mg-motion family). */
  prompt?: string;
  guidance?: string;
  visualDNA?: string;
  cameraLanguage?: string;
  promptSuffix?: string;
  tags?: readonly string[];
  bestFor?: string;
  /** Engine hint such as 'midjourney'; advisory only, never a binding. */
  engineHint?: string;
  /** Relative resource reference, loaded on demand. Empty in phase 1 (option A: thumbnails are not shipped). */
  thumbnailRef?: string;
  origin: StylePresetOrigin;
}

/**
 * MG motion recipe enums, carried over verbatim from kunpeng's MotionRecipe
 * structure as part of the K0-1 contract. Not yet consumed by any runtime.
 */
export interface MgMotionRecipe {
  density: 'balanced' | 'rich' | 'maximal';
  spatial: '2d' | '2.5d' | '3d';
  rhythm: 'steady' | 'narrative' | 'punchy';
  relationship: 'around-subject' | 'full-stage' | 'replace-background';
  material: 'follow-style' | 'glass' | 'paper' | 'soft-3d' | 'graphic';
}

export type StylePromptTemplateGroup =
  | 'gpt-image-2'
  | 'kling'
  | 'seedance'
  | 'shot-patterns'
  | 'checklists';

/** A prompt-template / shot-pattern / checklist reference document (Markdown text). */
export interface StylePromptTemplateDoc {
  docId: string;
  group: StylePromptTemplateGroup;
  title: string;
  content: string;
  origin: StylePresetOrigin;
}
