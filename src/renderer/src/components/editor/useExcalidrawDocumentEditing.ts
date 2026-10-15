import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { registerPendingEditorFlush } from './editor-pending-flush'

const EXCALIDRAW_COMMIT_DELAY_MS = 400

export type ExcalidrawDocumentEditing = {
  /** Marks the tab dirty now and commits `serialize()` once edits settle. */
  queueSceneChange: (serialize: () => string) => void
  /** Commits any queued change now and returns the latest document text. */
  flush: () => string
  hasPendingChange: () => boolean
  /** True when `text` is what this editor last committed, so it is not an external change. */
  isOwnContent: (text: string) => boolean
}

type UseExcalidrawDocumentEditingArgs = {
  content: string
  fileId: string
  onContentChange: (content: string) => void
  onDirtyStateHint: (dirty: boolean) => void
}

export function useExcalidrawDocumentEditing({
  content,
  fileId,
  onContentChange,
  onDirtyStateHint
}: UseExcalidrawDocumentEditingArgs): ExcalidrawDocumentEditing {
  const contentRef = useRef(content)
  const lastCommittedRef = useRef<string | null>(null)
  const serializeRef = useRef<(() => string) | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onContentChangeRef = useRef(onContentChange)
  const onDirtyStateHintRef = useRef(onDirtyStateHint)
  useLayoutEffect(() => {
    contentRef.current = content
    onContentChangeRef.current = onContentChange
    onDirtyStateHintRef.current = onDirtyStateHint
  }, [content, onContentChange, onDirtyStateHint])

  const flush = useCallback((): string => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const serialize = serializeRef.current
    serializeRef.current = null
    if (!serialize) {
      return contentRef.current
    }
    const next = serialize()
    if (next !== contentRef.current) {
      contentRef.current = next
      lastCommittedRef.current = next
      onContentChangeRef.current(next)
    }
    return next
  }, [])

  const queueSceneChange = useCallback(
    (serialize: () => string): void => {
      serializeRef.current = serialize
      onDirtyStateHintRef.current(true)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(flush, EXCALIDRAW_COMMIT_DELAY_MS)
    },
    [flush]
  )

  useEffect(() => registerPendingEditorFlush(fileId, flush), [fileId, flush])
  useEffect(
    () => () => {
      flush()
    },
    [flush]
  )

  return useMemo(
    () => ({
      queueSceneChange,
      flush,
      hasPendingChange: () => serializeRef.current !== null,
      isOwnContent: (text: string) => text === lastCommittedRef.current
    }),
    [queueSceneChange, flush]
  )
}
