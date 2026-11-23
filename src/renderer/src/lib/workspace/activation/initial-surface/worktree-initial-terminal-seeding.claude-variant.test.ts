import { describe, expect, it } from 'vitest'
import { ensureWorktreeHasInitialTerminal } from './worktree-initial-terminal-seeding'
import {
  createMockStore,
  registerWorktreeActivationReset
} from '@/lib/workspace/activation/worktree-activation.test-fixture'
import { buildWorktreeCreationStartupOpt } from '@/lib/workspace/creation/worktree-creation-flow-startup'
import type { WorktreeCreationRequest } from '@/lib/workspace/creation/pending-worktree-creation'

registerWorktreeActivationReset()

const variant = { id: 'v1', label: 'Kimi' }

describe('Ollama variant startup tabs', () => {
  it('marks the seeded startup tab and keeps it in the terminal', () => {
    const store = createMockStore()
    const startup = {
      command: 'claude',
      launchAgent: 'claude' as const,
      env: { ANTHROPIC_BASE_URL: 'http://localhost:11434' },
      claudeVariant: variant
    }

    ensureWorktreeHasInitialTerminal(store, 'wt-1', startup)

    expect(store.createTab).toHaveBeenCalledWith('wt-1', undefined, undefined, {
      pendingActivationSpawn: true,
      launchAgent: 'claude',
      viewMode: 'terminal',
      claudeVariant: variant,
      pendingStartup: startup
    })
  })

  it('marks only the startup default tab', () => {
    const store = createMockStore()
    const startup = { command: 'claude', launchAgent: 'claude' as const, claudeVariant: variant }

    ensureWorktreeHasInitialTerminal(store, 'wt-1', startup, undefined, undefined, {
      runCommands: false,
      tabs: [{ title: 'Agent' }, { title: 'Shell' }]
    })

    expect(store.createTab).toHaveBeenNthCalledWith(1, 'wt-1', undefined, undefined, {
      pendingActivationSpawn: true,
      recordInteraction: false,
      launchAgent: 'claude',
      viewMode: 'terminal',
      claudeVariant: variant,
      pendingStartup: startup
    })
    expect(store.createTab).toHaveBeenNthCalledWith(2, 'wt-1', undefined, undefined, {
      pendingActivationSpawn: true,
      recordInteraction: false
    })
  })

  it('threads the variant from the creation request onto the startup payload', () => {
    const request = {
      agent: 'claude',
      quickPrompt: '',
      quickTelemetry: null,
      claudeVariant: variant,
      startupPlan: {
        agent: 'claude',
        launchCommand: 'claude',
        expectedProcess: 'claude',
        followupPrompt: null,
        env: { ANTHROPIC_BASE_URL: 'http://localhost:11434' },
        launchConfig: { agentArgs: '', agentEnv: {} }
      }
    }

    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the startup builder reads only the fields set here.
    const startup = buildWorktreeCreationStartupOpt(
      request as unknown as WorktreeCreationRequest,
      false
    )

    expect(startup).toMatchObject({
      env: { ANTHROPIC_BASE_URL: 'http://localhost:11434' },
      launchAgent: 'claude',
      claudeVariant: variant
    })
  })
})
