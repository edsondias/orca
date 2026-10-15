import type { ImportedDataState } from '@excalidraw/excalidraw/data/types'

export type ExcalidrawFileParse =
  | { ok: true; scene: ImportedDataState | null }
  | { ok: false; error: string }

const NOT_A_SCENE = 'Not an Excalidraw scene: expected "type": "excalidraw" and a list of elements.'

/** Empty files are new drawings; anything else must be a scene, so the viewer never overwrites foreign JSON. */
export function parseExcalidrawFile(text: string): ExcalidrawFileParse {
  const body = text.replace(/^\uFEFF/, '')
  if (body.trim() === '') {
    return { ok: true, scene: null }
  }
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' }
  }
  return isExcalidrawScene(value) ? { ok: true, scene: value } : { ok: false, error: NOT_A_SCENE }
}

function isExcalidrawScene(value: unknown): value is ImportedDataState {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === 'excalidraw' &&
    (!('elements' in value) || value.elements === null || Array.isArray(value.elements))
  )
}
