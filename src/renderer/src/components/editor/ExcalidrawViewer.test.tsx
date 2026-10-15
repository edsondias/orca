// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockElement = { id: string; version: number }
type MockApi = {
  updateScene: ReturnType<typeof vi.fn>
  addFiles: ReturnType<typeof vi.fn>
  getSceneElementsIncludingDeleted: () => MockElement[]
  getFiles: () => Record<string, unknown>
}
type MockExcalidrawProps = {
  theme?: string
  excalidrawAPI?: (api: MockApi) => void
  onChange?: (elements: MockElement[], appState: object, files: Record<string, unknown>) => void
  onLibraryChange?: (items: unknown[]) => void
}

const mock = vi.hoisted(() => {
  const state: {
    props: MockExcalidrawProps | null
    sceneElements: MockElement[]
    dark: boolean
    setMarkdownViewMode: ReturnType<typeof vi.fn>
  } = { props: null, sceneElements: [], dark: false, setMarkdownViewMode: vi.fn() }
  return state
})

const api: MockApi = {
  updateScene: vi.fn((scene: { elements: MockElement[] }) => {
    mock.sceneElements = scene.elements
  }),
  addFiles: vi.fn(),
  getSceneElementsIncludingDeleted: () => mock.sceneElements,
  getFiles: () => ({})
}

vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: (props: MockExcalidrawProps) => {
    mock.props = props
    props.excalidrawAPI?.(api)
    return <div data-testid="excalidraw-canvas" tabIndex={0} />
  },
  CaptureUpdateAction: { NEVER: 'NEVER' },
  getSceneVersion: (elements: readonly MockElement[]) =>
    elements.reduce((sum, element) => sum + element.version, 0),
  restore: (data: { elements?: MockElement[]; appState?: unknown } | null) => {
    // Marker for a scene the shallow parser accepts but Excalidraw's restore rejects.
    if (data?.appState === 'x') {
      throw new Error('Cannot restore this scene')
    }
    return { elements: data?.elements ?? [], appState: {}, files: {} }
  },
  serializeAsJSON: (elements: readonly MockElement[]) =>
    JSON.stringify({ type: 'excalidraw', elements })
}))
vi.mock('@excalidraw/excalidraw/index.css', () => ({}))
vi.mock('@/hooks/use-document-dark-theme', () => ({ useDocumentDarkTheme: () => mock.dark }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ setMarkdownViewMode: mock.setMarkdownViewMode })
}))
vi.mock('./editor-shortcuts', () => ({
  installEditorSaveShortcut: (target: HTMLElement, onSave: () => void) => {
    const listener = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        event.stopPropagation()
        onSave()
      }
    }
    target.addEventListener('keydown', listener, true)
    return () => target.removeEventListener('keydown', listener, true)
  }
}))

import ExcalidrawViewer from './ExcalidrawViewer'

const SCENE = JSON.stringify({ type: 'excalidraw', elements: [{ id: 'a', version: 1 }] })
const UNRESTORABLE_SCENE = '{"type":"excalidraw","appState":"x"}'

function renderViewer(content = SCENE) {
  const onContentChange = vi.fn()
  const onDirtyStateHint = vi.fn()
  const onSave = vi.fn(async () => true)
  const view = render(
    <ExcalidrawViewer
      content={content}
      fileId="drawing-a"
      onContentChange={onContentChange}
      onDirtyStateHint={onDirtyStateHint}
      onSave={onSave}
    />
  )
  return { view, onContentChange, onDirtyStateHint, onSave }
}

function emitChange(elements: MockElement[]): void {
  act(() => {
    mock.props?.onChange?.(elements, {}, {})
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mock.props = null
  mock.sceneElements = []
  mock.dark = false
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      excalidrawLibrary: {
        read: vi.fn(async () => []),
        write: vi.fn(async () => undefined)
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('ExcalidrawViewer', () => {
  it('ignores the initial change and view-only changes', () => {
    const { onDirtyStateHint, onContentChange } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    emitChange([{ id: 'a', version: 1 }])
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onDirtyStateHint).not.toHaveBeenCalled()
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('commits a drawing change as scene JSON after the debounce', () => {
    const { onDirtyStateHint, onContentChange } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    emitChange([{ id: 'a', version: 2 }])
    expect(onDirtyStateHint).toHaveBeenCalledWith(true)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onContentChange).toHaveBeenCalledWith(
      JSON.stringify({ type: 'excalidraw', elements: [{ id: 'a', version: 2 }] })
    )
  })

  it('flushes the pending drawing before saving on Ctrl+S', async () => {
    const { onSave } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    emitChange([{ id: 'a', version: 3 }])
    fireEvent.keyDown(screen.getByTestId('excalidraw-canvas'), { key: 's', ctrlKey: true })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith(
      JSON.stringify({ type: 'excalidraw', elements: [{ id: 'a', version: 3 }] })
    )
  })

  it('reloads an external change into the open canvas without marking it dirty', () => {
    const { view, onDirtyStateHint } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    const external = JSON.stringify({ type: 'excalidraw', elements: [{ id: 'b', version: 5 }] })
    view.rerender(
      <ExcalidrawViewer
        content={external}
        fileId="drawing-a"
        onContentChange={vi.fn()}
        onDirtyStateHint={onDirtyStateHint}
        onSave={vi.fn(async () => true)}
      />
    )
    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ elements: [{ id: 'b', version: 5 }] })
    )
    emitChange([{ id: 'b', version: 5 }])
    expect(onDirtyStateHint).not.toHaveBeenCalled()
  })

  it('shows an error with a way to the source and never writes invalid files', () => {
    const { onContentChange } = renderViewer('{"type":"excalidrawlib"}')
    expect(screen.getByText('This drawing could not be opened.')).toBeTruthy()
    expect(screen.queryByTestId('excalidraw-canvas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Source' }))
    expect(mock.setMarkdownViewMode).toHaveBeenCalledWith('drawing-a', 'source')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('shows an error instead of crashing when Excalidraw cannot restore the scene', () => {
    const { onContentChange } = renderViewer(UNRESTORABLE_SCENE)
    expect(screen.getByText('This drawing could not be opened.')).toBeTruthy()
    expect(screen.getByText('Cannot restore this scene')).toBeTruthy()
    expect(screen.queryByTestId('excalidraw-canvas')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('shows an error when an external change cannot be restored', () => {
    const onContentChange = vi.fn()
    const { view } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    view.rerender(
      <ExcalidrawViewer
        content={UNRESTORABLE_SCENE}
        fileId="drawing-a"
        onContentChange={onContentChange}
        onDirtyStateHint={vi.fn()}
        onSave={vi.fn(async () => true)}
      />
    )
    expect(screen.getByText('Cannot restore this scene')).toBeTruthy()
    expect(screen.queryByTestId('excalidraw-canvas')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('follows the Orca theme', () => {
    mock.dark = true
    renderViewer()
    expect(mock.props?.theme).toBe('dark')
  })
})
