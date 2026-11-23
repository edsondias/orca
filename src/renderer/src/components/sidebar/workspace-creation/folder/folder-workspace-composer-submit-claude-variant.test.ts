// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { makeProjectGroup, makeFolderWorkspace } from './folder-workspace-composer-submit-fixtures'

const mocks = vi.hoisted(() => ({
  activateAndRevealFolderWorkspace: vi.fn(),
  planAgentSessionLaunch: vi.fn()
}))

vi.mock('@/lib/workspace/activation/worktree-activation', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, activateAndRevealFolderWorkspace: mocks.activateAndRevealFolderWorkspace }
})

vi.mock('@/lib/agent-session/launch/routing/agent-session-launch-plan', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, planAgentSessionLaunch: mocks.planAgentSessionLaunch }
})

import { submitFolderWorkspaceCreate } from './folder-workspace-composer-submit'

describe('submitFolderWorkspaceCreate with an Ollama Claude variant', () => {
  it('launches the variant in a marked terminal tab with its Ollama env', async () => {
    mocks.activateAndRevealFolderWorkspace.mockReturnValue({ primaryTabId: 'tab-1' })

    await submitFolderWorkspaceCreate({
      projectGroup: makeProjectGroup(),
      name: 'hi',
      lastAutoName: '',
      linkedWorkItem: null,
      note: '',
      quickAgent: 'claude',
      claudeVariant: { id: 'v1', label: 'Kimi', model: 'kimi-k2:cloud', context1m: false },
      autoRenameBranchFromWork: false,
      agentCmdOverrides: {},
      sessionOptions: { model: 'opus' },
      createFolderWorkspace: vi.fn(async () => ({ folderWorkspace: makeFolderWorkspace() })),
      onOpenChange: vi.fn()
    })

    // Why: a variant skips route planning; its env exists only in the terminal.
    expect(mocks.planAgentSessionLaunch).not.toHaveBeenCalled()
    const activation = mocks.activateAndRevealFolderWorkspace.mock.calls[0]?.[1]
    expect(activation?.providesInitialSurface).toBeUndefined()
    expect(activation?.startup?.claudeVariant).toEqual({ id: 'v1', label: 'Kimi' })
    expect(activation?.startup?.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'http://localhost:11434',
      ANTHROPIC_MODEL: 'kimi-k2:cloud'
    })
    expect(activation?.startup?.command).not.toMatch(/--model/)
  })
})
