import { describe, expect, it } from 'vitest'
import { buildQuickCreationRequest, type QuickCreationRequestInput } from './quick-creation-request'

function createInput(
  overrides: Partial<QuickCreationRequestInput> = {}
): QuickCreationRequestInput {
  return {
    repoId: 'repo-1',
    ephemeralVmRecipe: undefined,
    indeterminateProgress: false,
    taskSourceContext: null,
    linkedWorkItem: null,
    workspaceRunContext: null,
    workspaceName: 'variant-request',
    nameWasGenerated: false,
    displayName: undefined,
    selectedRepoIsGit: true,
    baseBranch: undefined,
    compareBaseRef: undefined,
    setupDecision: 'inherit',
    sparseDirectories: null,
    sparsePresetId: null,
    telemetrySource: undefined,
    linkedIssue: null,
    linkedPR: null,
    pushTarget: undefined,
    agent: 'claude',
    linkedLinearIssue: undefined,
    linkedLinearIssueWorkspaceId: undefined,
    linkedLinearIssueOrganizationUrlKey: undefined,
    branchNameOverride: undefined,
    parentWorktreeId: null,
    workspaceStatus: undefined,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    includeGitLabLinks: true,
    startup: undefined,
    pendingFirstAgentMessageRename: false,
    note: '',
    startupPlan: null,
    quickPrompt: '',
    launchDraftPrompt: undefined,
    promptDelivery: 'auto-submit',
    quickTelemetry: null,
    suppressTerminalFocusOnCompletion: false,
    setupOnly: false,
    claudeVariant: null,
    ...overrides
  }
}

describe('quick composer creation request with an Ollama variant', () => {
  it('carries the variant mark to the renderer-owned startup tab', () => {
    const mark = { id: 'v1', label: 'Kimi' }

    expect(buildQuickCreationRequest(createInput({ claudeVariant: mark })).claudeVariant).toEqual(
      mark
    )
  })

  it('leaves the mark off a plain Claude request', () => {
    expect(buildQuickCreationRequest(createInput())).not.toHaveProperty('claudeVariant')
  })
})
