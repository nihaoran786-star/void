/**
 * Skill glyphs — a deterministic open-source Lucide mark per skill identity.
 *
 * Skills are tools, so their mark never animates; motion belongs to the card.
 * Matching runs over the display name plus the *describing* part of the runtime
 * identity. Everything else falls back to a stable hash pick from a curated
 * pool, so two unmatched skills still read as different marks instead of one
 * repeated placeholder.
 *
 * Patterns stay ASCII on purpose: the i18n governance gate treats CJK literals
 * in source as untranslated copy. Localized keyword matching would belong in
 * the locale resources, not here.
 *
 * Icons come from `lucide-react`, already a project dependency and published
 * under the ISC license, so no new asset pipeline or attribution surface is
 * introduced.
 */

import {
  Bug,
  Calculator,
  ClipboardCheck,
  Code2,
  Compass,
  Database,
  FileSpreadsheet,
  FileText,
  Film,
  GitPullRequestArrow,
  Image,
  Languages,
  Layers,
  Lightbulb,
  Mail,
  MessageSquare,
  Mic,
  Music,
  Notebook,
  Palette,
  PenLine,
  Presentation,
  ScrollText,
  Search,
  Shapes,
  ShieldCheck,
  Sparkles,
  Table2,
  Telescope,
  Terminal,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

// Word boundaries matter: without them a workspace folder called `codex` or a
// skill named `notebook` pulls unrelated skills into the same glyph, and the
// whole catalog collapses onto one mark.
const SKILL_ICON_RULES: ReadonlyArray<readonly [RegExp, LucideIcon]> = [
  [/research|investigat|survey/i, Telescope],
  [/\bsearch|lookup|retriev|\bfind\b/i, Search],
  [/script|screenplay|storyboard|\bscene\b/i, ScrollText],
  [/\bwrit|copywrit|\bdraft|compose/i, PenLine],
  [/translat|language|locale|i18n/i, Languages],
  [/\breview|critique|inspect/i, ClipboardCheck],
  [/\bcode\b|coding|program|develop|refactor/i, Code2],
  [/\bbug\b|debug|troubleshoot|diagnos/i, Bug],
  [/pull.?request|\bmerge\b|commit|branch|\bgit\b/i, GitPullRequestArrow],
  [/terminal|shell|bash|\bcli\b|command/i, Terminal],
  [/spreadsheet|excel|xlsx|csv/i, FileSpreadsheet],
  [/\btable\b|dataset|tabular/i, Table2],
  [/database|\bsql\b|query|storage/i, Database],
  [/calculat|\bmath\b|finance|account|budget/i, Calculator],
  [/document|report|docx|\bpdf\b|manual/i, FileText],
  [/\bnote\b|memo|journal|minutes/i, Notebook],
  [/slide|\bdeck\b|present|pptx/i, Presentation],
  [/\bmail|email|inbox|newsletter/i, Mail],
  [/support|\bchat\b|conversat|reply/i, MessageSquare],
  [/design|visual|palette|brand|theme/i, Palette],
  [/\bimage|picture|photo|illustrat/i, Image],
  [/\bvideo|\bclip\b|footage/i, Video],
  [/\bfilm\b|movie|drama|trailer/i, Film],
  [/audio|voice|speech|\basr\b|\btts\b|podcast/i, Mic],
  [/music|\bsong\b|soundtrack|melody/i, Music],
  [/security|permission|complian|audit/i, ShieldCheck],
  [/\bplan\b|strategy|roadmap|\bscope\b/i, Compass],
  [/\bidea\b|brainstorm|creative|concept/i, Lightbulb],
  [/\btool\b|\bops\b|maintain|utility|deploy/i, Wrench],
  [/workflow|pipeline|orchestrat|process/i, Layers],
];

/** Fallback pool: distinct silhouettes, so hash picks never look repetitive. */
const SKILL_ICON_POOL: readonly LucideIcon[] = [
  Sparkles,
  Shapes,
  Compass,
  Lightbulb,
  Layers,
  Notebook,
  Wrench,
  Telescope,
  PenLine,
  Palette,
  Terminal,
  ClipboardCheck,
];

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Only the last identity segment describes the skill. The prefix carries the
 * install scope and the workspace folder, so matching the whole string made
 * every skill under a folder called `codex` resolve to the code glyph.
 */
function describingPart(identity: string): string {
  const segments = identity.split(/::|\//).filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

export function resolveSkillCatalogIcon(identity: string, name = ''): LucideIcon {
  const searchable = `${name} ${describingPart(identity)}`;
  const matched = SKILL_ICON_RULES.find(([pattern]) => pattern.test(searchable));
  if (matched) {
    return matched[1];
  }
  return SKILL_ICON_POOL[fnv1a(`skill:${identity}`) % SKILL_ICON_POOL.length]!;
}
