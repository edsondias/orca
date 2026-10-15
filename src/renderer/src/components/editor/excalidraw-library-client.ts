import type { LibraryItems, LibraryItems_anyVersion } from '@excalidraw/excalidraw/types'

const LIBRARY_SAVE_DELAY_MS = 500
let pendingSave: ReturnType<typeof setTimeout> | null = null

function isLibraryItems(value: unknown): value is LibraryItems_anyVersion {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Array.isArray(item) ||
        (typeof item === 'object' &&
          item !== null &&
          'elements' in item &&
          Array.isArray(item.elements))
    )
  )
}

export async function loadExcalidrawLibrary(): Promise<LibraryItems_anyVersion> {
  try {
    const items = await window.api.excalidrawLibrary.read()
    return isLibraryItems(items) ? items : []
  } catch (error) {
    console.warn('[excalidraw] library unavailable', error)
    return []
  }
}

/** Debounced across viewers so dragging items around writes the file once. */
export function saveExcalidrawLibrary(items: LibraryItems): void {
  if (pendingSave !== null) {
    clearTimeout(pendingSave)
  }
  pendingSave = setTimeout(() => {
    pendingSave = null
    Promise.resolve()
      .then(() => window.api.excalidrawLibrary.write(items))
      .catch((error: unknown) => console.warn('[excalidraw] failed to save the library', error))
  }, LIBRARY_SAVE_DELAY_MS)
}

/** An empty list only replaces the stored library after this session has seen items in it. */
export function shouldPersistLibrary(itemCount: number, libraryHadItems: boolean): boolean {
  return itemCount > 0 || libraryHadItems
}
