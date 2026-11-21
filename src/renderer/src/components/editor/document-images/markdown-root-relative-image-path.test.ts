import { afterEach, describe, expect, it } from 'vitest'
import {
  forgetRootRelativeImagePathsForTests,
  getRootRelativeImagePathCandidates,
  rememberRootRelativeImagePath
} from './markdown-root-relative-image-path'
import { resolveImageAbsolutePath } from '../markdown/link-routing/markdown-preview-links'

afterEach(() => {
  forgetRootRelativeImagePathsForTests()
})

describe('getRootRelativeImagePathCandidates', () => {
  it('lists the document folders nearest-first, leaving out the drive root', () => {
    expect(
      getRootRelativeImagePathCandidates(
        '/.attachments/image_289_-492.png',
        'E:\\devops\\Benner\\tmp\\jurix-wiki\\Telas-anotadas.md'
      )
    ).toEqual([
      'E:/devops/Benner/tmp/jurix-wiki/.attachments/image_289_-492.png',
      'E:/devops/Benner/tmp/.attachments/image_289_-492.png',
      'E:/devops/Benner/.attachments/image_289_-492.png',
      'E:/devops/.attachments/image_289_-492.png'
    ])
  })

  it('lists POSIX folders nearest-first, leaving out the filesystem root', () => {
    expect(
      getRootRelativeImagePathCandidates('/assets/logo%20dark.png', '/repo/docs/readme.md')
    ).toEqual(['/repo/docs/assets/logo dark.png', '/repo/assets/logo dark.png'])
  })

  it('ignores document-relative and protocol-relative sources', () => {
    expect(getRootRelativeImagePathCandidates('assets/logo.png', '/repo/docs/readme.md')).toEqual(
      []
    )
    expect(getRootRelativeImagePathCandidates('//cdn.test/logo.png', '/repo/readme.md')).toEqual([])
  })
})

describe('resolveImageAbsolutePath with a remembered root-relative image', () => {
  it('returns the folder where the image was found instead of the drive root', () => {
    const filePath = 'E:\\wiki\\page.md'
    expect(resolveImageAbsolutePath('/.attachments/a.png', filePath)).toBe('E:/.attachments/a.png')

    rememberRootRelativeImagePath('/.attachments/a.png', filePath, 'E:/wiki/.attachments/a.png')

    expect(resolveImageAbsolutePath('/.attachments/a.png', filePath)).toBe(
      'E:/wiki/.attachments/a.png'
    )
  })
})
