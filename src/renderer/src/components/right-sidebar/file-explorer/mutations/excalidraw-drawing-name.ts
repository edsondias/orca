/** Appends `.excalidraw` unless the name already ends in a scene suffix Orca opens visually. */
export function toExcalidrawDrawingName(name: string): string {
  const lower = name.toLowerCase()
  return lower.endsWith('.excalidraw') || lower.endsWith('.excalidraw.json')
    ? name
    : `${name}.excalidraw`
}
