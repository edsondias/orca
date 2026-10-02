import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAR_SESSION_END_GRACE_MS, createCarSessionStore } from './car-session-store'

describe('car session store', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const make = () => createCarSessionStore({ setTimer: setTimeout, clearTimer: clearTimeout })

  it('starts inactive', () => {
    expect(make().getSnapshot().phase).toBe('inactive')
  })

  it('activates when Android Auto projects', () => {
    const store = make()
    store.setProjecting(true)
    expect(store.getSnapshot().phase).toBe('active')
  })

  it('activates from Car mode without projection', () => {
    const store = make()
    store.setCarModeEnabled(true)
    expect(store.isActive()).toBe(true)
  })

  it('keeps the session through a 60 second cable glitch', () => {
    const store = make()
    store.setProjecting(true)
    store.setProjecting(false)
    expect(store.getSnapshot().phase).toBe('ending')
    expect(store.isActive()).toBe(true)
    vi.advanceTimersByTime(CAR_SESSION_END_GRACE_MS - 1)
    store.setProjecting(true)
    expect(store.getSnapshot().phase).toBe('active')
  })

  it('ends after the grace period', () => {
    const store = make()
    store.setProjecting(true)
    store.setProjecting(false)
    vi.advanceTimersByTime(CAR_SESSION_END_GRACE_MS)
    expect(store.getSnapshot().phase).toBe('inactive')
  })

  it('notifies subscribers on every phase change', () => {
    const store = make()
    const listener = vi.fn()
    store.subscribe(listener)
    store.setProjecting(true)
    store.setProjecting(false)
    vi.advanceTimersByTime(CAR_SESSION_END_GRACE_MS)
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
