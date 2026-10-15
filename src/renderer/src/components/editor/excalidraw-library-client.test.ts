// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushExcalidrawLibrarySave,
  loadExcalidrawLibrary,
  resetExcalidrawLibraryClientForTests,
  saveExcalidrawLibrary,
  shouldPersistLibrary
} from './excalidraw-library-client'

const read = vi.fn<() => Promise<unknown>>()
const write = vi.fn<(items: readonly unknown[]) => Promise<void>>()

const DISK = [{ id: 'disk', status: 'unpublished' as const, elements: [], created: 1 }]
const QUEUED = [...DISK, { id: 'new', status: 'unpublished' as const, elements: [], created: 2 }]

beforeEach(() => {
  resetExcalidrawLibraryClientForTests()
  vi.useFakeTimers()
  read.mockReset()
  write.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { excalidrawLibrary: { read, write } }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Excalidraw library client', () => {
  it('loads stored items', async () => {
    const items = [{ id: 'a', status: 'unpublished', elements: [], created: 1 }]
    read.mockResolvedValue(items)
    await expect(loadExcalidrawLibrary()).resolves.toEqual(items)
  })

  it('falls back to an empty library when the stored data is not a list of items', async () => {
    read.mockResolvedValue([42])
    await expect(loadExcalidrawLibrary()).resolves.toEqual([])
  })

  it('falls back to an empty library when the channel is unavailable', async () => {
    read.mockRejectedValue(new Error('No handler registered'))
    await expect(loadExcalidrawLibrary()).resolves.toEqual([])
  })

  it('writes only the latest library after edits settle', async () => {
    saveExcalidrawLibrary([])
    const latest = [{ id: 'b', status: 'unpublished' as const, elements: [], created: 2 }]
    saveExcalidrawLibrary(latest)
    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(latest)
  })

  it('returns the latest queued library instead of re-reading stale disk', async () => {
    read.mockResolvedValue(DISK)
    await loadExcalidrawLibrary()
    saveExcalidrawLibrary(QUEUED)
    await expect(loadExcalidrawLibrary()).resolves.toEqual(QUEUED)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('does not let an echo of the latest library cancel a pending write', async () => {
    read.mockResolvedValue(DISK)
    await loadExcalidrawLibrary()
    saveExcalidrawLibrary(QUEUED)
    await vi.advanceTimersByTimeAsync(300)
    saveExcalidrawLibrary(structuredClone(QUEUED))
    await vi.advanceTimersByTimeAsync(200)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(QUEUED)
  })

  it('writes a pending library at once when flushed', async () => {
    saveExcalidrawLibrary(QUEUED)
    flushExcalidrawLibrarySave()
    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenCalledWith(QUEUED)
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('writes nothing after the stored library could not be read', async () => {
    read.mockRejectedValue(new Error('EACCES: permission denied'))
    await loadExcalidrawLibrary()
    saveExcalidrawLibrary(QUEUED)
    flushExcalidrawLibrarySave()
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).not.toHaveBeenCalled()
  })

  it('writes nothing after the stored library failed validation', async () => {
    read.mockResolvedValue([42])
    await loadExcalidrawLibrary()
    saveExcalidrawLibrary(QUEUED)
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).not.toHaveBeenCalled()
  })

  it('writes nothing when the client has no library channel', async () => {
    // The web client's fallback proxy resolves undefined for an unknown call.
    read.mockResolvedValue(undefined)
    await loadExcalidrawLibrary()
    saveExcalidrawLibrary(QUEUED)
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).not.toHaveBeenCalled()
  })

  it('re-reads after a failed read and accepts saves once a read succeeds', async () => {
    read.mockRejectedValueOnce(new Error('EBUSY')).mockResolvedValue(DISK)
    await loadExcalidrawLibrary()
    await expect(loadExcalidrawLibrary()).resolves.toEqual(DISK)
    saveExcalidrawLibrary(QUEUED)
    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenCalledWith(QUEUED)
  })

  it('never lets an empty library replace one this session has not seen', () => {
    expect(shouldPersistLibrary(0, false)).toBe(false)
    expect(shouldPersistLibrary(0, true)).toBe(true)
    expect(shouldPersistLibrary(3, false)).toBe(true)
  })
})
