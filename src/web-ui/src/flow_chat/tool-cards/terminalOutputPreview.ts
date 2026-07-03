export interface TerminalOutputPreviewBudget {
  maxRows: number;
  maxCharacters: number;
}

export interface TerminalOutputPreview {
  content: string;
  wasTruncated: boolean;
  originalRowCount: number;
  originalCharacterCount: number;
}

function countRows(content: string): number {
  return content.split(/\r\n|\r|\n/).length;
}

function takeLastRows(content: string, maxRows: number): string {
  if (maxRows <= 0) {
    return '';
  }

  const rows = content.split(/\r\n|\r|\n/);
  return rows.slice(-maxRows).join('\n');
}

function takeLastCharactersAtLineBoundary(content: string, maxCharacters: number): string {
  if (maxCharacters <= 0) {
    return '';
  }

  if (content.length <= maxCharacters) {
    return content;
  }

  const rows = content.split('\n');
  const selectedRows: string[] = [];
  let selectedLength = 0;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const separatorLength = selectedRows.length > 0 ? 1 : 0;
    const nextLength = selectedLength + separatorLength + row.length;

    if (nextLength > maxCharacters) {
      break;
    }

    selectedRows.unshift(row);
    selectedLength = nextLength;
  }

  if (selectedRows.length === 0) {
    return rows[rows.length - 1].slice(-maxCharacters);
  }

  return selectedRows.join('\n');
}

export function createTerminalOutputPreview(
  content: string,
  budget: TerminalOutputPreviewBudget,
): TerminalOutputPreview {
  const originalRowCount = countRows(content);
  const originalCharacterCount = content.length;
  const rowLimitedContent = takeLastRows(content, budget.maxRows);
  const characterLimitedContent = takeLastCharactersAtLineBoundary(
    rowLimitedContent,
    budget.maxCharacters,
  );

  return {
    content: characterLimitedContent,
    wasTruncated: characterLimitedContent !== content,
    originalRowCount,
    originalCharacterCount,
  };
}
