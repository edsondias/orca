import type { LibraryItems, LibraryItems_anyVersion } from '@excalidraw/excalidraw/types'

const LIBRARY_SAVE_DELAY_MS = 500
let pendingSave: ReturnType<typeof setTimeout> | null = null
let pendingItems: LibraryItems | null = null
// Why: the session's newest library; disk may lag behind a queued write.
let latestLibrary: LibraryItems_anyVersion | null = null
// Why: after a failed read the stored items are unknown, so any write could erase them.
let libraryUnavailable = false
let warnedUnavailable = false

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
  if (latestLibrary !== null) {
    return latestLibrary
  }
  try {
    const items: unknown = await window.api.excalidrawLibrary.read()
    if (isLibraryItems(items)) {
      libraryUnavailable = false
      latestLibrary ??= items
      return latestLibrary
    }
    markLibraryUnavailable('stored data is not a list of library items')
  } catch (error) {
    markLibraryUnavailable(error)
  }
  return []
}

function markLibraryUnavailable(reason: unknown): void {
  libraryUnavailable = true
  pendingItems = null
  if (pendingSave !== null) {
    clearTimeout(pendingSave)
    pendingSave = null
  }
  console.warn('[excalidraw] library unavailable', reason)
}

function warnSkippedSave(): void {
  if (!warnedUnavailable) {
    warnedUnavailable = true
    console.warn('[excalidraw] library changes are not saved because the library could not be read')
  }
}

/** Debounced across viewers so dragging items around writes the file once. */
export function saveExcalidrawLibrary(items: LibraryItems): void {
  if (libraryUnavailable) {
    warnSkippedSave()
    return
  }
  // Why: opening a drawing echoes the loaded library; that must not cancel a pending write.
  if (latestLibrary !== null && JSON.stringify(items) === JSON.stringify(latestLibrary)) {
    return
  }
  latestLibrary = items
  pendingItems = items
  if (pendingSave !== null) {
    clearTimeout(pendingSave)
  }
  pendingSave = setTimeout(flushExcalidrawLibrarySave, LIBRARY_SAVE_DELAY_MS)
}

/** Writes a queued library now, e.g. when the last viewer closes. */
export function flushExcalidrawLibrarySave(): void {
  if (pendingSave !== null) {
    clearTimeout(pendingSave)
    pendingSave = null
  }
  const items = pendingItems
  pendingItems = null
  if (items === null) {
    return
  }
  Promise.resolve()
    .then(() => window.api.excalidrawLibrary.write(items))
    .catch((error: unknown) => console.warn('[excalidraw] failed to save the library', error))
}

/** An empty list only replaces the stored library after this session has seen items in it. */
export function shouldPersistLibrary(itemCount: number, libraryHadItems: boolean): boolean {
  return itemCount > 0 || libraryHadItems
}

export function resetExcalidrawLibraryClientForTests(): void {
  if (pendingSave !== null) {
    clearTimeout(pendingSave)
  }
  pendingSave = null
  pendingItems = null
  latestLibrary = null
  libraryUnavailable = false
  warnedUnavailable = false
}
