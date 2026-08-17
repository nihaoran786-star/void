/**
 * Skill glyphs — a deterministic open-source Lucide mark per skill identity.
 *
 * Skills are tools, so their mark never animates; motion belongs to the card.
 * Matching runs over the immutable runtime identity (which Void generates in
 * English) plus the display name, so a skill that says what it does gets a
 * matching mark. Everything else falls back to a stable hash pick from a
 * curated pool, so two unmatched skills still read as different marks instead
 * of one repeated placeholder.
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

const SKILL_ICON_RULES: ReadonlyArray<readonly [RegExp, LucideIcon]> = [
  [/research|investigat|survey/i, Telescope],
  [/search|lookup|retriev|find/i, Search],
  [/script|screenplay|storyboard|scene/i, ScrollText],
  [/writ|copywrit|draft|compose/i, PenLine],
  [/translat|language|locale|i18n/i, Languages],
  [/review|critique|inspect/i, ClipboardCheck],
  [/code|coding|program|develop/i, Code2],
  [/bug|debug|troubleshoot|diagnos/i, Bug],
  [/pull.?request|merge|commit|branch|git/i, GitPullRequestArrow],
  [/terminal|shell|bash|cli|command/i, Terminal],
  [/spreadsheet|excel|xlsx|csv/i, FileSpreadsheet],
  [/table|dataset|tabular/i, Table2],
  [/database|sql|query|storage/i, Database],
  [/calculat|math|finance|account|budget/i, Calculator],
  [/document|report|docx|pdf|manual/i, FileText],
  [/note|memo|journal|minutes/i, Notebook],
  [/slide|deck|present|pptx/i, Presentation],
  [/mail|email|inbox|newsletter/i, Mail],
  [/support|chat|conversat|reply/i, MessageSquare],
  [/design|visual|palette|brand|theme/i, Palette],
  [/image|picture|photo|illustrat/i, Image],
  [/video|clip|footage/i, Video],
  [/film|movie|drama|trailer/i, Film],
  [/audio|voice|speech|asr|tts|podcast/i, Mic],
  [/music|song|soundtrack|melody/i, Music],
  [/security|permission|complian|audit/i, ShieldCheck],
  [/plan|strategy|roadmap|scope/i, Compass],
  [/idea|brainstorm|creative|concept/i, Lightbulb],
  [/tool|ops|maintain|utility|deploy/i, Wrench],
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

export function resolveSkillCatalogIcon(identity: string, name = ''): LucideIcon {
  const searchable = `${identity} ${name}`;
  const matched = SKILL_ICON_RULES.find(([pattern]) => pattern.test(searchable));
  if (matched) {
    return matched[1];
  }
  return SKILL_ICON_POOL[fnv1a(`skill:${identity}`) % SKILL_ICON_POOL.length]!;
}
