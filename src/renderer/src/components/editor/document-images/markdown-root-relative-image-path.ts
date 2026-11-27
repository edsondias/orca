import {
  fileUriToFilesystemPath,
  filesystemPathToFileUri
} from '../../../../../shared/file-links/file-uri-path'

// Why: wikis (Azure DevOps) and repos (GitHub) resolve `/img.png` against their own root,
// which Orca can't know, so callers probe the document's folders and remember the hit here.
const rememberedPaths = new Map<string, string>()

function memoKey(rawSrc: string, filePath: string): string {
  return `${filePath}\0${rawSrc}`
}

export function isRootRelativeImageSrc(rawSrc: string): boolean {
  return rawSrc.startsWith('/') && !rawSrc.startsWith('//')
}

/** The document's folders joined with the src, nearest-first; the filesystem root is left out. */
export function getRootRelativeImagePathCandidates(rawSrc: string, filePath: string): string[] {
  if (!isRootRelativeImageSrc(rawSrc)) {
    return []
  }
  const candidates: string[] = []
  let folder = new URL('./', filesystemPathToFileUri(filePath))
  for (let parent = new URL('../', folder); parent.href !== folder.href;) {
    const candidate = fileUriToFilesystemPath(new URL(`.${rawSrc}`, folder))
    if (candidate) {
      candidates.push(candidate)
    }
    folder = parent
    parent = new URL('../', folder)
  }
  return candidates
}

export function getRememberedRootRelativeImagePath(
  rawSrc: string,
  filePath: string
): string | undefined {
  return rememberedPaths.get(memoKey(rawSrc, filePath))
}

export function rememberRootRelativeImagePath(
  rawSrc: string,
  filePath: string,
  absolutePath: string
): void {
  rememberedPaths.set(memoKey(rawSrc, filePath), absolutePath)
}

export function forgetRootRelativeImagePathsForTests(): void {
  rememberedPaths.clear()
}

/** Load `absolutePath`; when the filesystem root lacks a `/`-rooted src, probe the document's folders. */
export async function loadWithRootRelativeImageFallback(
  rawSrc: string,
  filePath: string,
  absolutePath: string,
  load: (path: string) => Promise<string | null>
): Promise<string | null> {
  const url = await load(absolutePath)
  if (url) {
    return url
  }
  for (const candidate of getRootRelativeImagePathCandidates(rawSrc, filePath)) {
    const candidateUrl = await load(candidate)
    if (candidateUrl) {
      rememberRootRelativeImagePath(rawSrc, filePath, candidate)
      return candidateUrl
    }
  }
  return null
}
