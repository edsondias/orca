import { readFileSync } from 'node:fs'
import { writeFileAtomically } from '../filesystem/atomic-file-publication'
import { isENOENT } from '../filesystem/local-file-io/filesystem-path-containment'

/** Same envelope as an exported `.excalidrawlib`, so the file can be imported elsewhere. */
type ExcalidrawLibraryFile = {
  type: 'excalidrawlib'
  version: 2
  source: string
  libraryItems: unknown[]
}

export function readExcalidrawLibrary(filePath: string): unknown[] {
  let text: string
  try {
    text = readFileSync(filePath, 'utf-8')
  } catch (error) {
    // Why: only a missing file is an empty library; answering [] for an unreadable one lets the next save erase it.
    if (isENOENT(error)) {
      return []
    }
    throw error
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'libraryItems' in parsed &&
      Array.isArray(parsed.libraryItems)
    ) {
      return parsed.libraryItems
    }
  } catch {
    // Why: a corrupt file must not block drawing; the next valid write replaces it.
  }
  return []
}

export function writeExcalidrawLibrary(filePath: string, libraryItems: unknown): void {
  if (!Array.isArray(libraryItems)) {
    throw new Error('Excalidraw library items must be an array.')
  }
  const file: ExcalidrawLibraryFile = {
    type: 'excalidrawlib',
    version: 2,
    source: 'orca',
    libraryItems
  }
  writeFileAtomically(filePath, `${JSON.stringify(file)}\n`)
}
