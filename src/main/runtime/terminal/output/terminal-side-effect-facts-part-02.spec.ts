import { describe, expect, it, vi } from 'vitest'
import '../../construction/test-context/runtime-test-module-registration.spec'
import './provider-snapshot-budget'
import '../../orca-runtime'

import { syncSinglePty } from '../../construction/test-context/orca-runtime-test-fixtures.spec'
import { createSideEffectRuntime } from '../../construction/test-context/orca-runtime-test-scenario-builders.spec'

describe('terminal side-effect fact channel', () => {
  it('keeps mode transitions that race a provider snapshot response', async () => {
    const { runtime } = createSideEffectRuntime()
    let resolveProviderSnapshot:
      | ((snapshot: {
          data: string
          cols: number
          rows: number
          seq: number
          source: 'headless'
          alternateScreen: boolean
        }) => void)
      | undefined
    const serializeProviderBuffer = vi.fn(
      () =>
        new Promise<{
          data: string
          cols: number
          rows: number
          seq: number
          source: 'headless'
          alternateScreen: boolean
        }>((resolve) => {
          resolveProviderSnapshot = resolve
        })
    )
    runtime.setPtyController({
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null,
      serializeProviderBuffer,
      hasRendererSerializer: () => false
    })
    runtime.synchronizePtyOutputSequenceFromProvider(
      'pty-tui-race',
      { value: 900, generation: 'continued' },
      0
    )

    const snapshotPromise = runtime.serializeTerminalBuffer('pty-tui-race')
    await vi.waitFor(() => expect(resolveProviderSnapshot).toBeDefined())
    runtime.onPtyData('pty-tui-race', '\x1b[?1049l', 100)
    resolveProviderSnapshot?.({
      data: 'captured alt screen',
      cols: 80,
      rows: 24,
      seq: 900,
      source: 'headless',
      alternateScreen: true
    })
    await snapshotPromise

    expect(runtime.isTerminalAlternateScreen('pty-tui-race')).toBe(false)
  })

  it('parses synthetic frames statelessly so ticks cannot corrupt the bell detector', async () => {
    const { runtime, batches } = createSideEffectRuntime()
    await syncSinglePty(runtime)

    runtime.onPtyData('pty-1', '\x1b]0;split ti', 100)
    // An 80ms spinner tick lands between the two halves of the real OSC.
    runtime.ingestSyntheticTitleFrame('pty-1', '\x1b]0;⠋ Cursor Agent\x07')
    // This BEL terminates the real partial OSC; it is not a bell.
    runtime.onPtyData('pty-1', 'tle\x07', 101)
    // A later standalone BEL must still produce a bell fact.
    runtime.onPtyData('pty-1', 'ready\x07', 102)

    expect(batches.flatMap((batch) => batch.facts)).toEqual([
      { kind: 'title', normalizedTitle: '⠋ Cursor Agent', rawTitle: '⠋ Cursor Agent' },
      { kind: 'agent-working' },
      { kind: 'title', normalizedTitle: 'split title', rawTitle: 'split title' },
      { kind: 'bell' }
    ])
  })

  describe('agent-exited phone notice', () => {
    const exitNotices = (runtime: ReturnType<typeof createSideEffectRuntime>['runtime']) =>
      runtime
        .getMissedNotificationsSince(0, undefined)
        .filter((event) => event.type === 'notification' && event.source === 'agent-exited')

    it('announces once, desktop-suppressed, on the exited verdict', async () => {
      const { runtime, batches } = createSideEffectRuntime(async () => 'exited')
      syncSinglePty(runtime)
      runtime.setPtyController({
        write: () => true,
        kill: () => true,
        getForegroundProcess: vi.fn(async () => 'zsh')
      })
      runtime.ingestSyntheticTitleFrame('pty-1', ']0;Codex ready')
      runtime.onPtyData('pty-1', ']0;~/repo', 100)
      await vi.waitFor(() => expect(exitNotices(runtime)).toHaveLength(1))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(exitNotices(runtime)).toHaveLength(1)
      expect(exitNotices(runtime)[0]).toMatchObject({ desktopAllowed: false })
      expect(batches.flatMap((batch) => batch.facts)).toContainEqual({ kind: 'agent-exited' })
    })

    it.each([
      { name: 'live verdict', presence: 'live' as const, foreground: async () => 'zsh' },
      {
        name: 'unverifiable verdict with an unanswered foreground read',
        presence: 'unverifiable' as const,
        foreground: () => {
          throw new TypeError('getForegroundProcess is unavailable')
        }
      },
      {
        name: 'unverifiable verdict even when the foreground read answers',
        presence: 'unverifiable' as const,
        foreground: async () => 'zsh'
      }
    ])('stays silent for $name', async ({ presence, foreground }) => {
      const { runtime } = createSideEffectRuntime(async () => presence)
      syncSinglePty(runtime)
      runtime.setPtyController({
        write: () => true,
        kill: () => true,
        getForegroundProcess: foreground
      })
      runtime.ingestSyntheticTitleFrame('pty-1', ']0;Codex ready')
      runtime.onPtyData('pty-1', ']0;bichir', 100)
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(exitNotices(runtime)).toHaveLength(0)
    })
  })
})
