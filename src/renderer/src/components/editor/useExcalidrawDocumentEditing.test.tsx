// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPendingEditorChange } from './editor-pending-flush'
import { useExcalidrawDocumentEditing } from './useExcalidrawDocumentEditing'

function setup(initialContent = '') {
  const onContentChange = vi.fn()
  const onDirtyStateHint = vi.fn()
  const hook = renderHook(
    ({ content }: { content: string }) =>
      useExcalidrawDocumentEditing({
        content,
        fileId: 'drawing-a',
        onContentChange,
        onDirtyStateHint
      }),
    { initialProps: { content: initialContent } }
  )
  return { hook, onContentChange, onDirtyStateHint }
}

describe('Excalidraw document editing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks dirty at once and commits only the latest scene after the debounce', () => {
    const { hook, onContentChange, onDirtyStateHint } = setup()
    act(() => {
      hook.result.current.queueSceneChange(() => 'first')
      hook.result.current.queueSceneChange(() => 'second')
    })
    expect(onDirtyStateHint).toHaveBeenCalledWith(true)
    expect(onContentChange).not.toHaveBeenCalled()
    expect(hook.result.current.hasPendingChange()).toBe(true)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onContentChange).toHaveBeenCalledTimes(1)
    expect(onContentChange).toHaveBeenCalledWith('second')
    expect(hook.result.current.hasPendingChange()).toBe(false)
  })

  it('flushes a pending change synchronously and returns the latest text', () => {
    const { hook, onContentChange } = setup('saved')
    act(() => {
      hook.result.current.queueSceneChange(() => 'drawn')
    })
    let flushed = ''
    act(() => {
      flushed = hook.result.current.flush()
    })
    expect(flushed).toBe('drawn')
    expect(onContentChange).toHaveBeenCalledWith('drawn')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onContentChange).toHaveBeenCalledTimes(1)
  })

  it('returns the current content when nothing is pending', () => {
    const { hook, onContentChange } = setup('saved')
    expect(hook.result.current.flush()).toBe('saved')
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('recognises its own committed text but not external text', () => {
    const { hook } = setup('saved')
    act(() => {
      hook.result.current.queueSceneChange(() => 'drawn')
      hook.result.current.flush()
    })
    expect(hook.result.current.isOwnContent('drawn')).toBe(true)
    expect(hook.result.current.isOwnContent('saved')).toBe(false)
    expect(hook.result.current.isOwnContent('edited elsewhere')).toBe(false)
  })

  it('forgets its committed text once the file moves past it', () => {
    const { hook } = setup('saved')
    act(() => {
      hook.result.current.queueSceneChange(() => 'A')
      hook.result.current.flush()
    })
    hook.rerender({ content: 'A' })
    expect(hook.result.current.isOwnContent('A')).toBe(true)
    hook.rerender({ content: 'B' })
    hook.rerender({ content: 'A' })
    expect(hook.result.current.isOwnContent('A')).toBe(false)
  })

  it('lets save and tab close flush through the pending editor registry', () => {
    const { hook, onContentChange } = setup()
    act(() => {
      hook.result.current.queueSceneChange(() => 'drawn')
    })
    act(() => {
      flushPendingEditorChange('drawing-a')
    })
    expect(onContentChange).toHaveBeenCalledWith('drawn')
  })

  it('commits the pending change when the viewer unmounts', () => {
    const { hook, onContentChange } = setup()
    act(() => {
      hook.result.current.queueSceneChange(() => 'last stroke')
    })
    hook.unmount()
    expect(onContentChange).toHaveBeenCalledWith('last stroke')
  })
})
