import { describe, expect, it } from 'vitest'
import { createNotificationStreamFilter } from './rpc/methods/notifications/notification-stream-policy'
import { buildAgentExitedMobileNotification } from './agent-exited-mobile-notification'
import { RuntimeMobileNotificationController } from './push/notifications/runtime-mobile-notification-controller'

describe('mobile notification prompt reference', () => {
  it('rides the socket stream and the replay untouched', () => {
    const controller = new RuntimeMobileNotificationController()
    const seen: unknown[] = []
    controller.onDispatched((event) => seen.push(event))
    const promptRef = { kind: 'structured' as const, sessionId: 's1' }
    controller.dispatch({
      type: 'notification',
      source: 'agent-task-complete',
      agentState: 'blocked',
      title: 't',
      body: '',
      worktreeId: 'wt',
      promptRef
    })
    expect(seen[0]).toMatchObject({ promptRef })
    expect(controller.getMissedSince(0)[0]).toMatchObject({ promptRef })
  })

  it('keeps the exit notice from plain subscribers and from the legacy cooldown', () => {
    const controller = new RuntimeMobileNotificationController()
    const plain: unknown[] = []
    const car: unknown[] = []
    controller.onDispatched((event) => {
      if (createNotificationStreamFilter(false)(event)) {
        plain.push(event)
      }
      if (createNotificationStreamFilter(true)(event)) {
        car.push(event)
      }
    })
    controller.dispatch(
      buildAgentExitedMobileNotification({
        ptyId: 'p',
        generation: 1,
        attribution: { worktreeId: 'wt' },
        emittedAt: 9_000
      })
    )
    controller.dispatch({
      type: 'notification',
      source: 'terminal-bell',
      title: 'bell',
      body: '',
      worktreeId: 'wt',
      emittedAt: 10_000
    })
    expect(car).toHaveLength(2)
    expect(plain).toHaveLength(1)
    expect(plain[0]).toMatchObject({ source: 'terminal-bell', legacySocketAllowed: true })
  })

  it('names the workspace whose agent exited', () => {
    const event = buildAgentExitedMobileNotification({
      ptyId: 'p',
      generation: 1,
      attribution: { worktreeId: 'repo::/w/feature-x' },
      label: 'feature-x',
      emittedAt: 9_000
    })
    expect(event).toMatchObject({
      title: 'Agent exited in feature-x',
      desktopAllowed: false,
      source: 'agent-exited'
    })
  })
})
