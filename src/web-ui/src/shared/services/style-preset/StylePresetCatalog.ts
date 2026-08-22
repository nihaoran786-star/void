/**
 * Read-only style preset catalog (K1-a of the Infinite Canvas & Media Tools
 * specification). Pure lookup logic over converted kunpeng data files; no
 * React, Zustand, or Tauri dependencies. Consumers treat every returned value
 * as immutable reference data.
 */
import type {
  StylePreset,
  StylePresetFamily,
  StylePromptTemplateDoc,
} from './StylePresetTypes';
import { CINEMATIC_STYLE_PRESETS } from './data/cinematicStyles';
import { ANIMATION_2D_STYLE_PRESETS } from './data/animation2dStyles';
import { MIDJOURNEY_STYLE_PRESETS } from './data/midjourneyStyles';
import { MG_STYLE_PRESETS } from './data/mgStyles';
import { STYLE_PROMPT_TEMPLATE_DOCS } from './data/promptTemplates';

export class StylePresetCatalog {
  private readonly presets: readonly StylePreset[];
  private readonly presetsById: ReadonlyMap<string, StylePreset>;
  private readonly docsById: ReadonlyMap<string, StylePromptTemplateDoc>;

  public constructor(
    presets: readonly StylePreset[] = [
      ...CINEMATIC_STYLE_PRESETS,
      ...ANIMATION_2D_STYLE_PRESETS,
      ...MIDJOURNEY_STYLE_PRESETS,
      ...MG_STYLE_PRESETS,
    ],
    private readonly promptTemplateDocs: readonly StylePromptTemplateDoc[] =
      STYLE_PROMPT_TEMPLATE_DOCS,
  ) {
    this.presets = presets;
    this.presetsById = new Map(presets.map((preset) => [preset.presetId, preset]));
    this.docsById = new Map(promptTemplateDocs.map((doc) => [doc.docId, doc]));
  }

  public list(): readonly StylePreset[] {
    return this.presets;
  }

  public getById(presetId: string): StylePreset | undefined {
    return this.presetsById.get(presetId);
  }

  public listByFamily(family: StylePresetFamily): readonly StylePreset[] {
    return this.presets.filter((preset) => preset.family === family);
  }

  public listByCategory(
    family: StylePresetFamily,
    category: string,
  ): readonly StylePreset[] {
    return this.presets.filter(
      (preset) => preset.family === family && preset.category === category,
    );
  }

  /** Distinct category ids of one family, in first-appearance order. */
  public listCategories(family: StylePresetFamily): readonly string[] {
    const seen = new Set<string>();
    for (const preset of this.presets) {
      if (preset.family === family) seen.add(preset.category);
    }
    return [...seen];
  }

  public listPromptTemplateDocs(): readonly StylePromptTemplateDoc[] {
    return this.promptTemplateDocs;
  }

  public getPromptTemplateDocById(docId: string): StylePromptTemplateDoc | undefined {
    return this.docsById.get(docId);
  }
}

/** Shared default catalog instance over the bundled kunpeng-derived data. */
export const stylePresetCatalog = new StylePresetCatalog();
