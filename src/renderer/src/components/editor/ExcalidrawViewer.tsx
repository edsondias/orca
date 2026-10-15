import '@excalidraw/excalidraw/index.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
  restore,
  serializeAsJSON
} from '@excalidraw/excalidraw'
import type { ImportedDataState } from '@excalidraw/excalidraw/data/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  LibraryItems,
  UIOptions
} from '@excalidraw/excalidraw/types'
import { Button } from '@/components/ui/button'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { installEditorSaveShortcut } from './editor-shortcuts'
import { parseExcalidrawFile } from './excalidraw-file-parse'
import {
  flushExcalidrawLibrarySave,
  loadExcalidrawLibrary,
  saveExcalidrawLibrary,
  shouldPersistLibrary
} from './excalidraw-library-client'
import { useExcalidrawDocumentEditing } from './useExcalidrawDocumentEditing'

type ExcalidrawViewerProps = {
  content: string
  fileId: string
  onContentChange: (content: string) => void
  onDirtyStateHint: (dirty: boolean) => void
  onSave: (content: string) => Promise<boolean>
}

type ViewerState =
  | { kind: 'error'; message: string }
  | { kind: 'scene'; initialData: ExcalidrawInitialDataState; mountKey: number }

type RestoredScene = ReturnType<typeof restore>

// Why: the Orca file is the document; Excalidraw's own open/save dialogs would bypass it.
const UI_OPTIONS: Partial<UIOptions> = {
  canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false }
}

// Why: restore throws on scenes the shallow parser accepts (e.g. a null element).
function restoreScene(
  scene: ImportedDataState | null
): { ok: true; restored: RestoredScene } | { ok: false; error: string } {
  try {
    return { ok: true, restored: restore(scene, null, null) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Malformed scene data.' }
  }
}

function toInitialData(restored: RestoredScene): ExcalidrawInitialDataState {
  return {
    elements: restored.elements,
    appState: restored.appState,
    files: restored.files,
    scrollToContent: true,
    libraryItems: loadExcalidrawLibrary()
  }
}

function viewerStateFor(content: string, mountKey: number): ViewerState {
  const parsed = parseExcalidrawFile(content)
  if (!parsed.ok) {
    return { kind: 'error', message: parsed.error }
  }
  const result = restoreScene(parsed.scene)
  return result.ok
    ? { kind: 'scene', initialData: toInitialData(result.restored), mountKey }
    : { kind: 'error', message: result.error }
}

export default function ExcalidrawViewer({
  content,
  fileId,
  onContentChange,
  onDirtyStateHint,
  onSave
}: ExcalidrawViewerProps): React.JSX.Element {
  const isDark = useDocumentDarkTheme()
  const setMarkdownViewMode = useAppStore((s) => s.setMarkdownViewMode)
  const [viewerState, setViewerState] = useState(() => viewerStateFor(content, 0))
  const rootRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const sceneVersionRef = useRef<number | null>(null)
  const fileCountRef = useRef(0)
  const lastSeenContentRef = useRef(content)
  const libraryHadItemsRef = useRef(false)
  const editing = useExcalidrawDocumentEditing({
    content,
    fileId,
    onContentChange,
    onDirtyStateHint
  })

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const version = getSceneVersion(elements)
      const fileCount = Object.keys(files).length
      if (sceneVersionRef.current === null) {
        sceneVersionRef.current = version
        fileCountRef.current = fileCount
        return
      }
      // Why: onChange also fires for selection, zoom and scroll, which are not edits.
      if (version === sceneVersionRef.current && fileCount === fileCountRef.current) {
        return
      }
      sceneVersionRef.current = version
      fileCountRef.current = fileCount
      // Why: serialize from this snapshot; on unmount the API's scene may already be cleared.
      editing.queueSceneChange(() => serializeAsJSON(elements, appState, files, 'local'))
    },
    [editing]
  )

  const handleLibraryChange = useCallback((items: LibraryItems) => {
    if (!shouldPersistLibrary(items.length, libraryHadItemsRef.current)) {
      return
    }
    libraryHadItemsRef.current = true
    saveExcalidrawLibrary(items)
  }, [])

  useEffect(() => flushExcalidrawLibrarySave, [])

  useEffect(() => {
    if (content === lastSeenContentRef.current) {
      return
    }
    lastSeenContentRef.current = content
    if (editing.isOwnContent(content) || editing.hasPendingChange()) {
      return
    }
    const parsed = parseExcalidrawFile(content)
    if (!parsed.ok) {
      apiRef.current = null
      setViewerState({ kind: 'error', message: parsed.error })
      return
    }
    const api = apiRef.current
    if (viewerState.kind === 'error' || !api) {
      sceneVersionRef.current = null
      setViewerState((current) =>
        viewerStateFor(content, current.kind === 'scene' ? current.mountKey + 1 : 1)
      )
      return
    }
    const result = restoreScene(parsed.scene)
    if (!result.ok) {
      apiRef.current = null
      setViewerState({ kind: 'error', message: result.error })
      return
    }
    api.addFiles(Object.values(result.restored.files))
    api.updateScene({
      elements: result.restored.elements,
      captureUpdate: CaptureUpdateAction.NEVER
    })
    sceneVersionRef.current = getSceneVersion(api.getSceneElementsIncludingDeleted())
    fileCountRef.current = Object.keys(api.getFiles()).length
  }, [content, editing, viewerState.kind])

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    return installEditorSaveShortcut(root, () => {
      void onSave(editing.flush())
    })
  }, [editing, onSave, viewerState.kind])

  if (viewerState.kind === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-editor-surface p-6 text-sm text-muted-foreground">
        <div className="flex max-w-md items-start gap-3 rounded-md border border-border bg-background p-4">
          <AlertCircle className="mt-0.5 size-4 text-destructive" />
          <div>
            <div className="font-medium text-foreground">
              {translate(
                'auto.components.editor.ExcalidrawViewer.361dee5208',
                'This drawing could not be opened.'
              )}
            </div>
            <div className="mt-1">{viewerState.message}</div>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => setMarkdownViewMode(fileId, 'source')}
            >
              {translate('auto.components.editor.ExcalidrawViewer.01669bb639', 'Open Source')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="h-full w-full min-h-0">
      <Excalidraw
        key={viewerState.mountKey}
        initialData={viewerState.initialData}
        excalidrawAPI={(api) => {
          apiRef.current = api
        }}
        theme={isDark ? 'dark' : 'light'}
        UIOptions={UI_OPTIONS}
        onChange={handleChange}
        onLibraryChange={handleLibraryChange}
      />
    </div>
  )
}
