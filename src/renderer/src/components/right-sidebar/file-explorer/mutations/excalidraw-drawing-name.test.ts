import { describe, expect, it } from 'vitest'
import { toExcalidrawDrawingName } from './excalidraw-drawing-name'

describe('toExcalidrawDrawingName', () => {
  it.each([
    ['diagram', 'diagram.excalidraw'],
    ['docs/diagram', 'docs/diagram.excalidraw'],
    ['notes.md', 'notes.md.excalidraw'],
    ['diagram.excalidraw', 'diagram.excalidraw'],
    ['Diagram.EXCALIDRAW', 'Diagram.EXCALIDRAW'],
    ['diagram.excalidraw.json', 'diagram.excalidraw.json']
  ])('turns %s into %s', (input, expected) => {
    expect(toExcalidrawDrawingName(input)).toBe(expected)
  })
})
