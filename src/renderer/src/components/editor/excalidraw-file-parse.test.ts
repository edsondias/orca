import { describe, expect, it } from 'vitest'
import { parseExcalidrawFile } from './excalidraw-file-parse'

const scene = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [{ id: 'r1', type: 'rectangle', version: 1 }],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {}
}

describe('parseExcalidrawFile', () => {
  it('treats an empty or whitespace-only file as a new blank drawing', () => {
    expect(parseExcalidrawFile('')).toEqual({ ok: true, scene: null })
    expect(parseExcalidrawFile('  \n\t')).toEqual({ ok: true, scene: null })
  })

  it('returns the scene of a valid Excalidraw file', () => {
    expect(parseExcalidrawFile(JSON.stringify(scene))).toEqual({ ok: true, scene })
  })

  it('accepts a file saved with a UTF-8 byte order mark', () => {
    expect(parseExcalidrawFile(`\uFEFF${JSON.stringify(scene)}`)).toEqual({ ok: true, scene })
  })

  it('accepts a scene without elements', () => {
    expect(parseExcalidrawFile('{"type":"excalidraw"}')).toEqual({
      ok: true,
      scene: { type: 'excalidraw' }
    })
  })

  it('rejects malformed JSON', () => {
    const result = parseExcalidrawFile('{"type":"excalidraw",')
    expect(result.ok).toBe(false)
  })

  it.each([
    ['an empty object', '{}'],
    ['a renamed library file', '{"type":"excalidrawlib","libraryItems":[]}'],
    ['an array', '[]'],
    ['a string', '"excalidraw"'],
    ['elements that are not a list', '{"type":"excalidraw","elements":{}}']
  ])('rejects %s as not an Excalidraw scene', (_label, text) => {
    expect(parseExcalidrawFile(text)).toEqual({
      ok: false,
      error: 'Not an Excalidraw scene: expected "type": "excalidraw" and a list of elements.'
    })
  })
})
