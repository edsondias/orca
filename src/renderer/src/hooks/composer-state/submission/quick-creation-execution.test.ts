// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import type { PreparedQuickSubmit } from './composer-submit-model'

const mocks = vi.hoisted(() => ({
  runBackgroundWorktreeCreation: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/lib/workspace/creation/worktree-creation-flow', () => ({
  runBackgroundWorktreeCreation: mocks.runBackgroundWorktreeCreation
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import { useQuickCreationExecution } from './quick-creation-execution'

type QuickCreationExecutionInput = Parameters<typeof useQuickCreationExecution>[0]

const kimi = { id: 'v1', label: 'Kimi', model: 'kimi-k2:cloud', context1m: false }

const prepared: PreparedQuickSubmit = {
  submitLinkedWorkItem: null,
  agent: 'claude',
  submitLinkedIssueNumber: null,
  submitLinkedPR: null,
  submitTitleName: null,
  nameIsAutoManaged: false,
  smartGitHubCreateNames: { workspaceName: 'workspace', displayName: undefined },
  workspaceName: 'workspace',
  nameWasGenerated: false,
  smartSubmitBaseBranch: undefined,
  submitCompareBaseRef: undefined,
  submitPushTarget: undefined,
  submitBranchNameOverride: undefined,
  effectiveSetupDecision: 'skip',
  hookPreparation: undefined,
  linkedLinearIssue: undefined,
  linkedLinearIssueWorkspaceId: undefined,
  linkedLinearIssueOrganizationUrlKey: undefined,
  effectiveBranchNameOverride: undefined,
  submitBaseBranch: undefined,
  createDisplayName: undefined,
  pendingFirstAgentMessageRename: false,
  trimmedNote: ''
}

function makeInput(
  overrides: Partial<QuickCreationExecutionInput> = {}
): QuickCreationExecutionInput {
  return {
    clearNewWorkspaceDraft: vi.fn(),
    createMultiple: false,
    effectivePresetId: null,
    ephemeralVmRecipes: [],
    ephemeralVmsEnabled: false,
    isSubmissionCancelled: () => false,
    linkedGitLabIssue: null,
    linkedGitLabMR: null,
    normalizedSparseDirectories: [],
    onCreated: vi.fn(),
    parentWorktreeId: null,
    persistDraft: false,
    persistSetupAgentStartupPolicy: vi.fn(async () => true),
    prepareQuickSubmit: vi.fn(async () => prepared),
    resetForNextCreate: vi.fn(),
    resolvedInitialWorkspaceStatus: undefined,
    selectedEphemeralVmRecipeId: null,
    selectedRepoAgentLaunchFact: { kind: 'known', platform: 'linux', hostKind: 'local' },
    selectedRepoExecutionHostId: null,
    selectedRepoIsGit: true,
    selectedRepoIsRemote: false,
    selectedRepoTarget: null,
    selectedRepoStartupShell: undefined,
    selectedWorkspaceTarget: { status: 'unavailable', reason: 'no-eligible-repo' },
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a refused variant fails before any other setting is read.
    settings: { claudeOllamaVariants: [kimi] } as unknown as GlobalSettings,
    sparseEnabled: false,
    taskSourceContext: null,
    telemetrySource: undefined,
    ...overrides
  }
}

async function runQuickCreation(
  input: QuickCreationExecutionInput,
  claudeVariantId: string
): Promise<void> {
  const hook = renderHook(() => useQuickCreationExecution(input))
  await act(async () =>
    hook.result.current.executeQuickCreation(
      { kind: 'none' },
      'claude',
      'workspace',
      null,
      'repo-1',
      { claudeVariantId }
    )
  )
}

describe('useQuickCreationExecution with an Ollama variant that cannot launch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the workspace without an agent when the variant no longer exists, and says so', async () => {
    await runQuickCreation(makeInput(), 'gone')

    expect(mocks.runBackgroundWorktreeCreation).toHaveBeenCalledWith(
      expect.objectContaining({ agent: null, startupPlan: null })
    )
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })

  it('launches no agent for a variant on an ephemeral VM, and says so', async () => {
    await runQuickCreation(
      makeInput({ ephemeralVmsEnabled: true, selectedEphemeralVmRecipeId: 'recipe-1' }),
      'v1'
    )

    expect(mocks.runBackgroundWorktreeCreation).toHaveBeenCalledWith(
      expect.objectContaining({ agent: null, startupPlan: null })
    )
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })
})
