// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Tab, TabGroup } from '../../../../../shared/workspace-layout/tab-groups/tab-types'
import type { TerminalTab } from '../../../../../shared/workspace-layout/terminal-tab-types'
import { getTabDragLabel } from '../../tab-bar/model/tab-bar-item-model'
import {
  useTabGroupItemProjections,
  type TabGroupWorktreeSnapshot
} from './useTabGroupItemProjections'

const MARK = { id: 'v1', label: 'Kimi K3.1' }
const GROUP: TabGroup = {
  id: 'g1',
  worktreeId: 'wt-1',
  activeTabId: 'u1',
  tabOrder: ['u1']
}

function unifiedTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'u1',
    entityId: 't1',
    groupId: 'g1',
    worktreeId: 'wt-1',
    contentType: 'terminal',
    label: 'Terminal 1',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...overrides
  }
}

function terminalTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id: 't1',
    ptyId: null,
    worktreeId: 'wt-1',
    title: 'Terminal 1',
    defaultTitle: 'Terminal 1',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...overrides
  }
}

// The tab bar resolves the projected terminal item a second time, so the label is read the same way.
function barLabel(unified: Tab, terminal: TerminalTab, generatedTabTitlesEnabled: boolean): string {
  const snapshot: TabGroupWorktreeSnapshot = {
    groups: [GROUP],
    unifiedTabs: [unified],
    terminalTabs: [terminal],
    openFiles: [],
    browserTabs: [],
    expandedPaneByTabId: {},
    terminalLayoutsByTabId: {},
    generatedTabTitlesEnabled,
    mobileEmulatorEnabled: false
  }
  const { result } = renderHook(() =>
    useTabGroupItemProjections({ groupId: 'g1', worktreeId: 'wt-1', worktreeState: snapshot })
  )
  const item = result.current.terminalTabs[0]
  return getTabDragLabel(
    { type: 'terminal', id: item.id, unifiedTabId: item.unifiedTabId, isPinned: false, data: item },
    generatedTabTitlesEnabled,
    null
  )
}

describe('useTabGroupItemProjections Claude variant mark', () => {
  it('keeps the prefix when a generated title wins the chain in the tab bar', () => {
    expect(
      barLabel(
        unifiedTab({ claudeVariant: MARK, generatedLabel: 'Refactor auth' }),
        terminalTab({ generatedTitle: 'Refactor auth' }),
        true
      )
    ).toBe('Kimi K3.1 · Refactor auth')
  })

  it('keeps the prefix when a quick command label wins the chain in the tab bar', () => {
    expect(
      barLabel(
        unifiedTab({ claudeVariant: MARK, quickCommandLabel: 'Run tests' }),
        terminalTab({ quickCommandLabel: 'Run tests' }),
        false
      )
    ).toBe('Kimi K3.1 · Run tests')
  })

  it('reads the mark from the terminal tab when the unified tab has none', () => {
    expect(
      barLabel(
        unifiedTab({ generatedLabel: 'Refactor auth' }),
        terminalTab({ claudeVariant: MARK, generatedTitle: 'Refactor auth' }),
        true
      )
    ).toBe('Kimi K3.1 · Refactor auth')
  })

  it('shows only the variant label while the tab still has its default terminal title', () => {
    expect(barLabel(unifiedTab({ claudeVariant: MARK }), terminalTab(), false)).toBe('Kimi K3.1')
  })

  it('shows the prefixed conversation title once Claude sets it', () => {
    expect(
      barLabel(
        unifiedTab({ claudeVariant: MARK, label: '✳ Corrigir o login' }),
        terminalTab({ title: '✳ Corrigir o login' }),
        false
      )
    ).toBe('Kimi K3.1 · ✳ Corrigir o login')
  })
})
