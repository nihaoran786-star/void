export function popLastExistingImageUndoId(
  undoStack: string[],
  existingContextIds: ReadonlySet<string>,
): string | null {
  while (undoStack.length > 0) {
    const imageId = undoStack.pop();
    if (imageId && existingContextIds.has(imageId)) {
      return imageId;
    }
  }

  return null;
}
