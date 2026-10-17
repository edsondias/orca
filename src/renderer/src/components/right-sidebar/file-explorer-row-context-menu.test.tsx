// @vitest-environment happy-dom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { FileExplorerRowContextMenu } from './file-explorer-row-context-menu'
import type { TreeNode } from './file-explorer-types'

const mocks = vi.hoisted(() => {
  const state = {
    openMarkdownPreview: vi.fn(),
    activeWorktreeId: 'wt-1',
    settings: {
      activeRuntimeEnvironmentId: null,
      openInApplications: [{ id: 'vscode', label: 'VS Code', command: 'code' }]
    },
    worktreesByRepo: {},
    repos: []
  }
  const useAppStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
  return { state, useAppStore, openWorktreePath: vi.fn(), openOpenInAppsSettings: vi.fn() }
})

vi.mock('@/store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => 'Unassigned' }))
vi.mock('@/lib/language-detect', () => ({ detectLanguage: () => 'plaintext' }))
vi.mock('@/lib/file-preview', () => ({ openFileInBrowserTab: vi.fn() }))
vi.mock('@/lib/local-path-open-guard', () => ({
  isLocalPathOpenBlocked: () => false,
  showLocalPathOpenBlockedToast: vi.fn()
}))
vi.mock('@/lib/open-in-app-catalog', () => ({ OpenInApplicationIcon: () => null }))
vi.mock('@/lib/local-file-manager-label', () => ({
  getLocalFileManagerLabel: () => 'File Explorer'
}))
vi.mock('@/lib/open-in-application-selection', () => ({ NO_OPEN_IN_APPLICATIONS: [] }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./file-explorer-row-action-visibility', () => ({
  shouldShowCollapseFolderAction: () => false,
  shouldShowCopyFileAction: () => false,
  shouldShowFindInFolderAction: () => false,
  shouldShowOpenInTerminalAction: () => false,
  shouldShowRemoteDownloadAction: () => false,
  shouldShowViewFileAction: () => false
}))
vi.mock('./file-explorer-row-file-transfer', () => ({
  copyFileToOsClipboard: vi.fn(),
  downloadRemoteFile: vi.fn()
}))
vi.mock('@/components/sidebar/WorktreeOpenInMenu', () => ({
  getWorktreeOpenInEntries: (
    apps: readonly { id: string; label: string; command: string }[],
    fileManagerLabel: string
  ) => [
    ...apps.map((app) => ({
      id: app.id,
      label: app.label,
      target: 'external-editor' as const,
      command: app.command
    })),
    { id: 'file-manager', label: fileManagerLabel, target: 'file-manager' as const }
  ],
  getOpenInEntryAvailability: () => ({ disabled: false }),
  openWorktreePath: mocks.openWorktreePath,
  openOpenInAppsSettings: mocks.openOpenInAppsSettings
}))

vi.mock('@/components/ui/context-menu', () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  return {
    ContextMenuContent: passthrough,
    ContextMenuSub: passthrough,
    ContextMenuSubContent: passthrough,
    ContextMenuSubTrigger: passthrough,
    ContextMenuSeparator: () => null,
    ContextMenuShortcut: passthrough,
    ContextMenuItem: ({
      children,
      onSelect,
      disabled
    }: {
      children?: React.ReactNode
      onSelect?: () => void
      disabled?: boolean
    }) => (
      <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
        {children}
      </button>
    )
  }
})

const fileNode: TreeNode = {
  name: 'App.tsx',
  path: '/repo/src/App.tsx',
  relativePath: 'src/App.tsx',
  isDirectory: false,
  depth: 1
}

function renderMenu(node: TreeNode = fileNode, connectionId: string | null = null) {
  return render(
    <FileExplorerRowContextMenu
      node={node}
      isExpanded={false}
      deleteShortcutLabel="Del"
      connectionId={connectionId}
      runtimeDownloadContext={undefined}
      supportsFolderDownload={false}
      canOpenInOrcaBrowser={false}
      canCollapseFolderSubtree={false}
      targetDir="/repo"
      targetDepth={0}
      selectionSize={1}
      canAddAsProject={false}
      onViewFile={vi.fn()}
      onCopyPaths={vi.fn()}
      onStartNew={vi.fn()}
      onStartRename={vi.fn()}
      onDuplicate={vi.fn()}
      onAddFolderAsProject={vi.fn()}
      onOpenInTerminal={vi.fn()}
      onRequestDelete={vi.fn()}
      onCollapseFolderSubtree={vi.fn()}
      onFindInFolder={vi.fn()}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FileExplorerRowContextMenu — Open in', () => {
  it('opens the file in VS Code via the configured app', () => {
    const view = renderMenu()
    fireEvent.click(view.getByText('VS Code'))
    expect(mocks.openWorktreePath).toHaveBeenCalledWith({
      target: 'external-editor',
      worktreePath: '/repo/src/App.tsx',
      connectionId: null,
      command: 'code'
    })
  })

  it('opens a folder in VS Code too', () => {
    const folder: TreeNode = {
      name: 'src',
      path: '/repo/src',
      relativePath: 'src',
      isDirectory: true,
      depth: 1
    }
    const view = renderMenu(folder)
    fireEvent.click(view.getByText('VS Code'))
    expect(mocks.openWorktreePath).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repo/src', command: 'code' })
    )
  })

  it('passes the SSH connection so VS Code can open the remote path', () => {
    const view = renderMenu(fileNode, 'conn-1')
    fireEvent.click(view.getByText('VS Code'))
    expect(mocks.openWorktreePath).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'conn-1', command: 'code' })
    )
  })
})
