import { describe, expect, it } from 'vitest'
import { createTestStore, seedStore } from '../../../testing/app-store-test-fixture'
import { makeWorktree } from '../../../slices/worktrees/worktree.test-fixture'

describe('createTab Claude variant mark', () => {
  it('stores the mark on terminal and unified tabs without touching the raw title', () => {
    const store = createTestStore()
    const wt = 'repo1::/path/wt1'
    const mark = { id: 'v1', label: 'Kimi K3.1' }

    seedStore(store, {
      worktreesByRepo: {
        repo1: [makeWorktree({ id: wt, repoId: 'repo1', path: '/path/wt1' })]
      }
    })

    const marked = store.getState().createTab(wt, undefined, undefined, { claudeVariant: mark })
    const plain = store.getState().createTab(wt, undefined, undefined)
    const state = store.getState()

    const markedTab = state.tabsByWorktree[wt].find((tab) => tab.id === marked.id)
    expect(markedTab?.claudeVariant).toEqual(mark)
    expect(markedTab?.title).toBe(markedTab?.defaultTitle)
    expect(
      state.unifiedTabsByWorktree[wt].find((tab) => tab.entityId === marked.id)?.claudeVariant
    ).toEqual(mark)
    expect(state.tabsByWorktree[wt].find((tab) => tab.id === plain.id)).not.toHaveProperty(
      'claudeVariant'
    )
  })
})
