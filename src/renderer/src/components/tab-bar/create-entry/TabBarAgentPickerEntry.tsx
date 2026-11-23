import { useMemo } from 'react'
import { useAppStore } from '@/store/index'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { getVisibleClaudeOllamaVariants } from '@/lib/visible-claude-ollama-variants'
import {
  useAgentPickerInventoryEntries,
  type AgentPickerInventorySource
} from '../../agent/agent-picker-inventory-source'
import { buildAgentPickerLaunchOptions } from './tab-agent-launch-options'
import TabBarCreateEntry from './TabBarCreateEntry'
import type { TabBarCreateEntryProps } from './tab-create-entry-props'

// Subscribe inside the menu so inventory updates do not re-render the tab bar.
export function TabBarAgentPickerEntry({
  inventory,
  hideAgents = false,
  ...props
}: Omit<TabBarCreateEntryProps, 'agentPickerEntries' | 'agentOptions'> & {
  inventory: AgentPickerInventorySource
  hideAgents?: boolean
}): React.JSX.Element {
  const entries = useAgentPickerInventoryEntries(inventory)
  const commandOverrides = useAppStore((state) => state.settings?.agentCmdOverrides)
  const configuredClaudeVariants = useAppStore((state) => state.settings?.claudeOllamaVariants)
  const runtimeEnvironmentId = useAppStore((state) =>
    runtimeEnvironmentIdOrLocalUnlessTwin(state, props.worktreeId)
  )
  const claudeVariants = getVisibleClaudeOllamaVariants(
    configuredClaudeVariants,
    runtimeEnvironmentId
  )
  const launchOptions = useMemo(
    () => buildAgentPickerLaunchOptions(entries, commandOverrides, undefined, claudeVariants),
    [entries, commandOverrides, claudeVariants]
  )
  return hideAgents ? (
    <TabBarCreateEntry {...props} />
  ) : (
    <TabBarCreateEntry {...props} agentPickerEntries={entries} agentOptions={launchOptions} />
  )
}
