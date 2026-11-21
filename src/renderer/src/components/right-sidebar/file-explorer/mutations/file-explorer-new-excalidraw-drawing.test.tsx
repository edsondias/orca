// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { createFileExplorerRowProjection } from '../tree/file-explorer-row-projection'
import { useFileExplorerInlineInput } from './useFileExplorerInlineInput'

const mocks = vi.hoisted(() => {
  const route = {
    target: { kind: 'local' },
    connectionId: null,
    expectedExecutionHostId: undefined,
    expectedSshTargetId: undefined,
    expectedSshConnectionGeneration: undefined
  }
  return {
    route,
    openFile: vi.fn(),
    toggleDir: vi.fn(),
    refreshDir: vi.fn().mockResolvedValue(undefined),
    createRuntimePath: vi.fn().mockResolvedValue(undefined),
    deleteRuntimePath: vi.fn().mockResolvedValue(undefined),
    commitFileExplorerOp: vi.fn()
  }
})

vi.mock('@/store/index', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openFile: mocks.openFile, toggleDir: mocks.toggleDir })
}))
vi.mock('@/runtime/files/mutations/runtime-file-mutation-client', () => ({
  createRuntimePath: mocks.createRuntimePath,
  deleteRuntimePath: mocks.deleteRuntimePath
}))
vi.mock('./fileExplorerUndoRedo', () => ({ commitFileExplorerOp: mocks.commitFileExplorerOp }))
vi.mock('../navigation/file-explorer-operation-owner', () => ({
  getFileExplorerOperationOwner: () => undefined,
  captureFileExplorerOperationGuard: () => ({
    route: mocks.route,
    assertCurrent: () => mocks.route
  })
}))

function Harness({ name }: { name: string }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { startNew, handleInlineSubmit } = useFileExplorerInlineInput({
    activeWorktreeId: 'wt-1',
    worktreePath: '/repo',
    expanded: new Set(),
    rowProjection: createFileExplorerRowProjection([]),
    scrollRef,
    refreshDir: mocks.refreshDir
  })
  return (
    <div ref={scrollRef} tabIndex={-1}>
      <button type="button" onClick={() => startNew('excalidraw', '/repo', 0)}>
        Start
      </button>
      <button type="button" onClick={() => handleInlineSubmit(name)}>
        Submit
      </button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('New Excalidraw Drawing', () => {
  it('creates an empty .excalidraw file and opens it in the editor', async () => {
    const view = render(<Harness name="diagram" />)
    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    fireEvent.click(view.getByRole('button', { name: 'Submit' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.createRuntimePath).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'wt-1' }),
      expect.stringMatching(/diagram\.excalidraw$/),
      'file'
    )
    expect(mocks.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'excalidraw', mode: 'edit' }),
      expect.anything()
    )
  })

  it('keeps a name that already has the scene suffix', async () => {
    const view = render(<Harness name="flow.excalidraw.json" />)
    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    fireEvent.click(view.getByRole('button', { name: 'Submit' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.createRuntimePath).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/flow\.excalidraw\.json$/),
      'file'
    )
  })
})
