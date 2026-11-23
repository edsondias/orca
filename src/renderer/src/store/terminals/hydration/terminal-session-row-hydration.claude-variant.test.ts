import { describe, expect, it } from 'vitest'
import '../retirement/terminal-orphan-cleanup'
import { createTestStore } from '../../testing/app-store-test-fixture'
import { makeLayout, makeTab } from '../testing/terminal-tab.test-fixture'
import { makeWorktree } from '../../slices/worktrees/worktree.test-fixture'

describe('hydrateWorkspaceSession Claude variant mark', () => {
  it('hydrates the mark from unified tabs back to terminal tabs', () => {
    const store = createTestStore()
    const wt = 'repo1::/path/wt1'
    const mark = { id: 'v1', label: 'Kimi K3.1' }

    store.setState({
      repos: [
        { id: 'repo1', path: '/repo1', displayName: 'Repo 1', badgeColor: '#000', addedAt: 0 }
      ],
      worktreesByRepo: {
        repo1: [makeWorktree({ id: wt, repoId: 'repo1', path: '/path/wt1' })]
      }
    })

    store.getState().hydrateWorkspaceSession({
      activeRepoId: 'repo1',
      activeWorktreeId: wt,
      activeTabId: 'tab-1',
      tabsByWorktree: {
        [wt]: [makeTab({ id: 'tab-1', worktreeId: wt, title: 'Claude Code' })]
      },
      terminalLayoutsByTabId: {
        'tab-1': makeLayout()
      },
      unifiedTabs: {
        [wt]: [
          {
            id: 'tab-1',
            entityId: 'tab-1',
            groupId: 'group-1',
            worktreeId: wt,
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
        [wt]: [{ id: 'group-1', worktreeId: wt, activeTabId: 'tab-1', tabOrder: ['tab-1'] }]
      }
    })

    expect(store.getState().tabsByWorktree[wt][0].claudeVariant).toEqual(mark)
  })
})
