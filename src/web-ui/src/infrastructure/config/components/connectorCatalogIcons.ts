import {
  Boxes,
  BookOpen,
  Brain,
  Cable,
  CalendarDays,
  Cloud,
  Database,
  FolderOpen,
  Github,
  GitBranch,
  Globe,
  Mail,
  MessageSquare,
  RadioTower,
  type LucideIcon,
} from 'lucide-react';

const CONNECTOR_ICON_RULES: ReadonlyArray<readonly [RegExp, LucideIcon]> = [
  [/\b(context ?7|docs?|documentation|manual|library)\b/i, BookOpen],
  [/\bgithub\b/i, Github],
  [/\b(gitlab|git|repository|repo)\b/i, GitBranch],
  [/\b(postgres|mysql|sqlite|database|db|supabase|redis)\b/i, Database],
  [/\b(filesystem|file|folder|drive|storage|box|sharepoint)\b/i, FolderOpen],
  [/\b(gmail|outlook|email|mail)\b/i, Mail],
  [/\b(calendar|schedule|time|timezone)\b/i, CalendarDays],
  [/\b(slack|teams|discord|chat|message)\b/i, MessageSquare],
  [/\b(browser|search|web|fetch|http|url|playwright)\b/i, Globe],
  [/\b(docker|kubernetes|container)\b/i, Boxes],
  [/\b(memory|knowledge|sequential|thinking|reasoning)\b/i, Brain],
  [/\b(cloud|aws|azure|gcp)\b/i, Cloud],
  [/\b(remote|sse|api|stream)\b/i, RadioTower],
];

export function resolveConnectorCatalogIcon(
  identity: string,
  name = '',
  transport = '',
): LucideIcon {
  const searchableIdentity = `${identity} ${name} ${transport}`;
  return CONNECTOR_ICON_RULES.find(([pattern]) => pattern.test(searchableIdentity))?.[1]
    ?? Cable;
}
