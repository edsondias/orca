import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readExcalidrawLibrary, writeExcalidrawLibrary } from './excalidraw-library-store'

let root: string
let libraryPath: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-excalidraw-library-'))
  libraryPath = join(root, 'excalidraw-library.json')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('Excalidraw library store', () => {
  it('reads a missing library as empty', () => {
    expect(readExcalidrawLibrary(libraryPath)).toEqual([])
  })

  it('throws when the library exists but cannot be read', () => {
    // A directory at the path fails with EISDIR, standing in for EACCES and other read errors.
    mkdirSync(libraryPath)
    expect(() => readExcalidrawLibrary(libraryPath)).toThrow()
  })

  it('reads a corrupt library as empty and leaves the file untouched', () => {
    writeFileSync(libraryPath, '{"libraryItems": [', 'utf-8')
    expect(readExcalidrawLibrary(libraryPath)).toEqual([])
    expect(readFileSync(libraryPath, 'utf-8')).toBe('{"libraryItems": [')
  })

  it('round-trips items in the standard .excalidrawlib envelope', () => {
    const items = [{ id: 'item-1', status: 'unpublished', elements: [], created: 1 }]
    writeExcalidrawLibrary(libraryPath, items)
    const file: unknown = JSON.parse(readFileSync(libraryPath, 'utf-8'))
    expect(file).toMatchObject({ type: 'excalidrawlib', version: 2, libraryItems: items })
    expect(readExcalidrawLibrary(libraryPath)).toEqual(items)
  })

  it('refuses to write anything that is not a list of items', () => {
    expect(() => writeExcalidrawLibrary(libraryPath, { libraryItems: [] })).toThrow(
      'Excalidraw library items must be an array.'
    )
  })
})
