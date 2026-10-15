// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadExcalidrawLibrary,
  saveExcalidrawLibrary,
  shouldPersistLibrary
} from './excalidraw-library-client'

const read = vi.fn<() => Promise<unknown[]>>()
const write = vi.fn<(items: readonly unknown[]) => Promise<void>>()

beforeEach(() => {
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

  it('never lets an empty library replace one this session has not seen', () => {
    expect(shouldPersistLibrary(0, false)).toBe(false)
    expect(shouldPersistLibrary(0, true)).toBe(true)
    expect(shouldPersistLibrary(3, false)).toBe(true)
  })
})
