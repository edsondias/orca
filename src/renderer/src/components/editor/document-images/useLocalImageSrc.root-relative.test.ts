// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getLocalImageSrcCacheKey,
  loadLocalImageSrc,
  useLocalImageSrc
} from './useLocalImageSrc'
import { resetLocalImageCacheState } from './local-image-src-cache'
import { forgetRootRelativeImagePathsForTests } from './markdown-root-relative-image-path'

function resetLocalImageSrcStateForTests(): void {
  resetLocalImageCacheState()
  forgetRootRelativeImagePathsForTests()
}

const WIKI_PAGE = 'E:/devops/Benner/tmp/jurix-wiki/Telas-anotadas.md'
const WIKI_IMAGE = 'E:/devops/Benner/tmp/jurix-wiki/.attachments/a.png'

function readFileServing(existingPath: string): ReturnType<typeof vi.fn> {
  const readFile = vi.fn(({ filePath }: { filePath: string }) =>
    filePath === existingPath
      ? Promise.resolve({ content: 'AA==', isBinary: true, mimeType: 'image/png' })
      : Promise.reject(new Error('ENOENT'))
  )
  globalThis.window.api = {
    fs: { readFile }
  } as unknown as Window['api']
  return readFile
}

function HookProbe({ onRender }: { onRender: (src: string | undefined) => void }): null {
  onRender(useLocalImageSrc('/.attachments/a.png', WIKI_PAGE))
  return null
}

beforeEach(() => {
  resetLocalImageSrcStateForTests()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:wiki-image')
  vi.spyOn(URL, 'revokeObjectURL').mockReset()
})

afterEach(() => {
  resetLocalImageSrcStateForTests()
  vi.restoreAllMocks()
})

describe('root-relative image sources', () => {
  it('finds a wiki attachment in the nearest folder that has it', async () => {
    const readFile = readFileServing(WIKI_IMAGE)

    await expect(loadLocalImageSrc('/.attachments/a.png', WIKI_PAGE)).resolves.toBe(
      'blob:wiki-image'
    )

    expect(readFile.mock.calls.map(([args]) => args.filePath)).toEqual([
      'E:/.attachments/a.png',
      WIKI_IMAGE
    ])
  })

  it('keys the cache by the found file so later loads skip the probe', async () => {
    const readFile = readFileServing(WIKI_IMAGE)
    await loadLocalImageSrc('/.attachments/a.png', WIKI_PAGE)

    expect(getLocalImageSrcCacheKey('/.attachments/a.png', WIKI_PAGE)?.endsWith(WIKI_IMAGE)).toBe(
      true
    )
    await expect(loadLocalImageSrc('/.attachments/a.png', WIKI_PAGE)).resolves.toBe(
      'blob:wiki-image'
    )
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it('keeps reading an existing filesystem-root path without probing folders', async () => {
    const readFile = readFileServing('/home/user/pic.png')

    await expect(loadLocalImageSrc('/home/user/pic.png', '/repo/docs/readme.md')).resolves.toBe(
      'blob:wiki-image'
    )
    expect(readFile).toHaveBeenCalledTimes(1)
  })

  it('shows the found attachment in the markdown preview hook', async () => {
    readFileServing(WIKI_IMAGE)
    const renders: (string | undefined)[] = []
    const root: Root = createRoot(document.createElement('div'))

    await act(async () => {
      root.render(createElement(HookProbe, { onRender: (src) => renders.push(src) }))
      for (let i = 0; i < 6; i += 1) {
        await Promise.resolve()
      }
    })

    expect(renders.at(-1)).toBe('blob:wiki-image')
    root.unmount()
  })
})
