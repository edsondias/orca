import { describe, it, expect } from 'vitest'
import { parseWorkspaceSession } from './workspace-session-schema'

describe('parseWorkspaceSession sleeping agents', () => {
  it('drops unsafe launch config while retaining its sleeping agent session', () => {
    const sessions = JSON.parse(`{
      "tab1:pane-1": {
        "paneKey": "tab1:pane-1",
        "tabId": "tab1",
        "worktreeId": "wt",
        "agent": "codex",
        "providerSession": { "key": "session_id", "id": "codex-session" },
        "prompt": "continue",
        "state": "working",
        "capturedAt": 10,
        "updatedAt": 9,
        "launchConfig": {
          "agentArgs": "",
          "agentEnv": { "__proto__": "polluted" }
        }
      }
    }`)
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      sleepingAgentSessionsByPaneKey: sessions
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const record = result.value.sleepingAgentSessionsByPaneKey?.['tab1:pane-1']
      expect(record?.agent).toBe('codex')
      expect(record?.launchConfig).toBeUndefined()
    }
  })

  it('keeps the Claude variant mark on a sleeping record and drops a malformed one', () => {
    const mark = { id: 'v1', label: 'Kimi K3.1' }
    const record = {
      paneKey: 'tab1:pane-1',
      tabId: 'tab1',
      worktreeId: 'wt',
      agent: 'claude',
      providerSession: { key: 'session_id', id: 'claude-session' },
      prompt: 'continue',
      state: 'done',
      capturedAt: 10,
      updatedAt: 10,
      origin: 'worktree-sleep'
    }
    const hydrate = (claudeVariant: unknown) => {
      const result = parseWorkspaceSession({
        activeRepoId: null,
        activeWorktreeId: null,
        activeTabId: null,
        tabsByWorktree: {},
        terminalLayoutsByTabId: {},
        sleepingAgentSessionsByPaneKey: { [record.paneKey]: { ...record, claudeVariant } }
      })
      expect(result.ok).toBe(true)
      return result.ok ? result.value.sleepingAgentSessionsByPaneKey?.[record.paneKey] : undefined
    }

    expect(hydrate(mark)?.claudeVariant).toEqual(mark)
    const malformed = hydrate({ id: 'v1' })
    expect(malformed).toMatchObject({ paneKey: record.paneKey, agent: 'claude', state: 'done' })
    expect(malformed?.claudeVariant).toBeUndefined()
  })
})
