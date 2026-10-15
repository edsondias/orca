import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { handleMock, removeHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn<(channel: string, handler: (...args: unknown[]) => unknown) => void>(),
  removeHandlerMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/unused') },
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock }
}))

import { registerExcalidrawLibraryHandlers } from './excalidraw-library'

let root: string

function handlerFor(channel: string): (...args: unknown[]) => unknown {
  const call = handleMock.mock.calls.find(([name]) => name === channel)
  if (!call) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return call[1]
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-excalidraw-ipc-'))
  registerExcalidrawLibraryHandlers(() => join(root, 'excalidraw-library.json'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('excalidrawLibrary IPC', () => {
  it('replaces stale handlers before registering', () => {
    expect(removeHandlerMock).toHaveBeenCalledWith('excalidrawLibrary:read')
    expect(removeHandlerMock).toHaveBeenCalledWith('excalidrawLibrary:write')
  })

  it('writes items and reads them back', () => {
    const items = [{ id: 'item-1', status: 'unpublished', elements: [], created: 1 }]
    handlerFor('excalidrawLibrary:write')({}, items)
    expect(handlerFor('excalidrawLibrary:read')({})).toEqual(items)
  })
})
