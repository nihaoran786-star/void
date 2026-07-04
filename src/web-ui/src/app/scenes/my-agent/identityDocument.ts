import yaml from 'yaml';

export interface IdentityDocument {
  name: string;
  creature: string;
  vibe: string;
  emoji: string;
  body: string;
  /** Original frontmatter block, used to preserve unknown metadata on save. */
  frontmatter?: string;
  /** Override for primary model slot. Empty string = inherit from template. */
  modelPrimary?: string;
  /** Override for fast model slot. Empty string = inherit from template. */
  modelFast?: string;
}

export const EMPTY_IDENTITY_DOCUMENT: IdentityDocument = {
  name: '',
  creature: '',
  vibe: '',
  emoji: '',
  body: '',
  frontmatter: '',
  modelPrimary: '',
  modelFast: '',
};

type IdentityFrontmatterField = Exclude<keyof IdentityDocument, 'body' | 'frontmatter'>;

const FRONTMATTER_FIELDS: IdentityFrontmatterField[] = [
  'name',
  'creature',
  'vibe',
  'emoji',
  'modelPrimary',
  'modelFast',
];

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeShortField(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function serializeScalar(value: string): string {
  return yaml.stringify(value).trimEnd();
}

export interface MarkdownFrontmatterSections {
  hasFrontmatter: boolean;
  frontmatter: string;
  body: string;
}

export function splitMarkdownFrontmatter(content: string): MarkdownFrontmatterSections {
  const normalizedContent = normalizeLineEndings(content || '');
  const frontmatterMatch = normalizedContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    return {
      hasFrontmatter: false,
      frontmatter: '',
      body: normalizedContent.trimEnd(),
    };
  }

  return {
    hasFrontmatter: true,
    frontmatter: frontmatterMatch[1] ?? '',
    body: (frontmatterMatch[2] ?? '').replace(/^\n+/, '').trimEnd(),
  };
}

function parseFrontmatterRecord(frontmatter: string): Record<string, unknown> {
  const parsed = yaml.parse(frontmatter || '');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function serializeUnknownFrontmatterFields(frontmatter: string): string {
  const knownFields = new Set<string>(FRONTMATTER_FIELDS);
  const unknownFields = Object.fromEntries(
    Object.entries(parseFrontmatterRecord(frontmatter)).filter(([field]) => !knownFields.has(field)),
  );

  if (Object.keys(unknownFields).length === 0) {
    return '';
  }

  return yaml.stringify(unknownFields).trimEnd();
}

export function parseIdentityDocument(content: string): IdentityDocument {
  const sections = splitMarkdownFrontmatter(content);
  if (!sections.hasFrontmatter) {
    return {
      ...EMPTY_IDENTITY_DOCUMENT,
      body: sections.body.trim(),
    };
  }

  const parsed = parseFrontmatterRecord(sections.frontmatter);

  return {
    name: normalizeShortField(parsed.name),
    creature: normalizeShortField(parsed.creature),
    vibe: normalizeShortField(parsed.vibe),
    emoji: normalizeShortField(parsed.emoji),
    body: sections.body,
    frontmatter: sections.frontmatter,
    modelPrimary: normalizeShortField(parsed.modelPrimary),
    modelFast: normalizeShortField(parsed.modelFast),
  };
}

export function serializeIdentityDocument(document: IdentityDocument): string {
  const normalized = {
    name: normalizeShortField(document.name),
    creature: normalizeShortField(document.creature),
    vibe: normalizeShortField(document.vibe),
    emoji: normalizeShortField(document.emoji),
    body: normalizeLineEndings(document.body || '').replace(/^\n+/, '').trimEnd(),
    modelPrimary: normalizeShortField(document.modelPrimary ?? ''),
    modelFast: normalizeShortField(document.modelFast ?? ''),
  };

  const optionalFields = new Set<IdentityFrontmatterField>(['modelPrimary', 'modelFast']);
  const frontmatter = FRONTMATTER_FIELDS
    .filter((field) => {
      if (optionalFields.has(field)) return !!normalized[field];
      return true;
    })
    .map((field) => {
      const value = normalized[field];
      return value ? `${field}: ${serializeScalar(value)}` : `${field}:`;
    })
    .join('\n');
  const unknownFrontmatter = serializeUnknownFrontmatterFields(document.frontmatter ?? '');
  const frontmatterWithUnknownFields = [frontmatter, unknownFrontmatter]
    .filter((section) => section.trim().length > 0)
    .join('\n');

  return `---\n${frontmatterWithUnknownFields}\n---\n\n${normalized.body}`.trimEnd() + '\n';
}

export function getIdentityFilePath(workspaceRoot: string): string {
  const normalizedRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${normalizedRoot}/IDENTITY.md`;
}
