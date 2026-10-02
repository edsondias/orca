import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { carSessionStore } from './car-session-store'
import { useCarSessionBridge } from './use-car-session-bridge'

const mocks = vi.hoisted(() => ({
  appStateListeners: new Set<(state: string) => void>(),
  startSession: vi.fn<() => Promise<void>>()
}))

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'background',
    addEventListener: (_type: string, listener: (state: string) => void) => {
      mocks.appStateListeners.add(listener)
      return { remove: () => mocks.appStateListeners.delete(listener) }
    }
  }
}))

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: true })
}))

vi.mock('../../modules/orca-car-messaging/src', () => ({
  OrcaCarMessaging: {
    startSession: mocks.startSession,
    stopSession: async () => {},
    publishConversation: async () => {},
    clearConversation: async () => {},
    clearConversations: async () => {},
    addReplyListener: () => ({ remove() {} }),
    addProjectionListener: () => ({ remove() {} })
  }
}))

vi.mock('../storage/preferences', () => ({
  loadCarModeEnabled: async () => true
}))

vi.mock('../transport/persisted-connection-log-store', () => ({
  recordCarSessionLog: () => {}
}))

function Probe(): null {
  useCarSessionBridge([])
  return null
}

let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  mocks.appStateListeners.clear()
  mocks.startSession.mockReset()
  carSessionStore.setCarModeEnabled(false)
})

describe('useCarSessionBridge', () => {
  it('retries a refused foreground service start when Orca comes to the foreground', async () => {
    mocks.startSession.mockRejectedValueOnce(new Error('ForegroundServiceStartNotAllowed'))
    mocks.startSession.mockResolvedValue(undefined)
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await vi.waitFor(() =>
      expect(carSessionStore.getSnapshot().startProblem).toBe('service-start-refused')
    )
    expect(mocks.startSession).toHaveBeenCalledTimes(1)
    await act(async () => {
      for (const listener of mocks.appStateListeners) {
        listener('active')
      }
    })
    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(carSessionStore.getSnapshot().startProblem).toBeNull())
  })

  it('does not retry a session that started', async () => {
    mocks.startSession.mockResolvedValue(undefined)
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(1))
    await act(async () => {
      for (const listener of mocks.appStateListeners) {
        listener('active')
      }
    })
    expect(mocks.startSession).toHaveBeenCalledTimes(1)
  })
})
