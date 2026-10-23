import React, { useCallback } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { useAppStore } from '@/store'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'
import { NO_OPEN_IN_APPLICATIONS } from '@/lib/open-in-application-selection'
import { getRouteForLocalPathOpenOwner } from '@/lib/local-path-open-guard'
import { getWorkspaceEditorSshHost } from '@/lib/workspace-editor-ssh-target'
import {
  getOpenInEntryAvailability,
  getWorktreeOpenInEntries,
  openOpenInAppsSettings,
  openWorktreePath
} from '@/components/sidebar/WorktreeOpenInMenu'
import { translate } from '@/i18n/i18n'

type FileExplorerRowOpenInSubMenuProps = {
  path: string
  /** Host that owns the row, the same one Reveal uses. */
  owner: Parameters<typeof getRouteForLocalPathOpenOwner>[0]
}

export function FileExplorerRowOpenInSubMenu({
  path,
  owner
}: FileExplorerRowOpenInSubMenuProps): React.JSX.Element {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const openInApplications = useAppStore(
    (s) => s.settings?.openInApplications ?? NO_OPEN_IN_APPLICATIONS
  )
  const entries = React.useMemo(
    () => getWorktreeOpenInEntries(openInApplications, getLocalFileManagerLabel()),
    [openInApplications]
  )
  const { connectionId, runtimeEnvironmentId, ownerUnresolved } =
    getRouteForLocalPathOpenOwner(owner)
  const workspace = React.useMemo(
    () => (activeWorktreeId ? { workspaceId: activeWorktreeId } : null),
    [activeWorktreeId]
  )
  const sshHost = useAppStore(useShallow((s) => getWorkspaceEditorSshHost(s, workspace)))
  const handleOpenIn = useCallback(
    (target: 'file-manager' | 'external-editor', command?: string) => {
      void openWorktreePath({
        target,
        worktreePath: path,
        connectionId,
        runtimeEnvironmentId,
        ownerUnresolved,
        workspace,
        command
      })
    },
    [connectionId, ownerUnresolved, path, runtimeEnvironmentId, workspace]
  )

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <FolderOpen />
        {translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-52">
        {entries.map((entry) => {
          const availability = getOpenInEntryAvailability(
            entry,
            connectionId,
            runtimeEnvironmentId,
            ownerUnresolved,
            sshHost
          )
          return (
            <ContextMenuItem
              key={entry.id}
              onSelect={() => handleOpenIn(entry.target, entry.command)}
              disabled={availability.disabled}
            >
              {entry.target === 'file-manager' ? (
                <FolderOpen />
              ) : entry.command ? (
                <OpenInApplicationIcon application={{ command: entry.command }} size={14} />
              ) : (
                <ExternalLink />
              )}
              <span className="min-w-0 truncate">{entry.label}</span>
              {availability.metadata ? (
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {availability.metadata}
                </span>
              ) : null}
            </ContextMenuItem>
          )
        })}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={openOpenInAppsSettings}>
          {translate('auto.components.sidebar.WorktreeOpenInMenu.1417fd8380', 'Customize apps...')}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
