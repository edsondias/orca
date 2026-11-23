import { describe, expect, it } from 'vitest'
import type { WorkspaceSessionState } from '../../../../../shared/workspace-session/workspace-session-state-types'
import { createTestStore } from '../../testing/app-store-test-fixture'
import { makeTab } from '../../terminals/testing/terminal-tab.test-fixture'
import { buildHydratedTabState } from './tabs-hydration'
import { projectWorktreeTabModelReconciliation } from './tabs-reconciliation'

const mark = { id: 'v1', label: 'Kimi K3.1' }

describe('Claude variant mark on unified tabs', () => {
  it('keeps the mark persisted on a unified terminal tab', () => {
    const session: WorkspaceSessionState = {
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      unifiedTabs: {
        w1: [
          {
            id: 't1',
            entityId: 't1',
            groupId: 'g1',
            worktreeId: 'w1',
            contentType: 'terminal',
            label: 'Claude Code',
            claudeVariant: mark,
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 1
          }
        ]
      },
      tabGroups: {
        w1: [{ id: 'g1', worktreeId: 'w1', activeTabId: 't1', tabOrder: ['t1'] }]
      }
    }

    const result = buildHydratedTabState(session, new Set(['w1']))

    expect(result.unifiedTabsByWorktree.w1[0].claudeVariant).toEqual(mark)
  })

  it('carries the mark when reconciliation adopts a legacy terminal row', () => {
    const store = createTestStore()
    store.setState({
      tabsByWorktree: {
        w1: [
          makeTab({
            id: 'tt1',
            worktreeId: 'w1',
            ptyId: 'pty-1',
            title: 'Claude Code',
            claudeVariant: mark
          })
        ]
      }
    })

    const { patch } = projectWorktreeTabModelReconciliation(store.getState(), 'w1')

    expect(patch.unifiedTabsByWorktree?.w1[0].claudeVariant).toEqual(mark)
  })
})
