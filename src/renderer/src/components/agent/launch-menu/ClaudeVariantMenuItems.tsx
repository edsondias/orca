import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import { translate } from '@/i18n/i18n'
import { useAppStateValue } from '@/store/retained-views/app-state-view'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { getVisibleClaudeOllamaVariants } from '@/lib/visible-claude-ollama-variants'
import type { ClaudeOllamaVariant } from '../../../../../shared/claude-ollama-variants'
import type { NewTabAgentMenuRow } from '../../../../../shared/agent-launch/picker/agent-launch-picker-rows'
import type { AgentPickerChoice } from '../agent-picker-search-rows'
import type { NewTabAgentMenuModel } from './new-tab-agent-menu-model'
import type { TabAgentMenuLaunch } from './AgentMenuItems'

export type ClaudeVariantMenuLaunches = {
  variants: readonly ClaudeOllamaVariant[]
  /** The row each variant launches through; null when Claude's CLI is not offered here. */
  row: NewTabAgentMenuRow | null
}

/** A variant runs Claude's CLI, so it needs a Claude terminal row or a detected Claude CLI. */
export function claudeVariantRow(model: NewTabAgentMenuModel): NewTabAgentMenuRow | null {
  if (model.state !== 'settled') {
    return null
  }
  const claudeRows = model.rows.filter((row) => row.agent === 'claude')
  const terminal = claudeRows.find((row) => row.kind === 'cli' || row.kind === 'terminal')
  if (terminal) {
    return terminal
  }
  const chat = claudeRows.find((row) => row.kind === 'chat')
  return chat && model.detection.detectedIds?.includes('claude')
    ? { kind: 'cli', agent: 'claude', executionHostId: chat.executionHostId }
    : null
}

export function useClaudeVariantMenuLaunches(
  model: NewTabAgentMenuModel
): ClaudeVariantMenuLaunches {
  const workspace = model.state === 'settled' ? model.pickerContext?.workspace : undefined
  const configured = useAppStateValue((state) => state.settings?.claudeOllamaVariants)
  const runtimeEnvironmentId = useAppStateValue((state) =>
    workspace?.worktreeId
      ? runtimeEnvironmentIdOrLocalUnlessTwin(state, workspace.worktreeId)
      : (workspace?.runtimeEnvironmentId ?? null)
  )
  const row = claudeVariantRow(model)
  return {
    variants: row ? getVisibleClaudeOllamaVariants(configured, runtimeEnvironmentId) : [],
    row
  }
}

function variantTitle(variant: ClaudeOllamaVariant): string {
  return translate(
    'auto.components.tab.bar.QuickLaunchButton.ec2adf093e',
    'Launch {{value0}} in a new terminal',
    { value0: variant.label }
  )
}

/** Picker rows for the variants; a search matches a variant's label or model. */
export function claudeVariantPickerChoices(
  { variants, row }: ClaudeVariantMenuLaunches,
  runLaunch: TabAgentMenuLaunch
): AgentPickerChoice[] | undefined {
  if (!row || variants.length === 0) {
    return undefined
  }
  return variants.map((variant) => ({
    id: `claude-variant:${variant.id}`,
    label: variant.label,
    icon: <AgentIcon agent="claude" size={14} />,
    matches: (query) => {
      const words = query.trim().toLowerCase().split(/\s+/)
      const haystack = `${variant.label} ${variant.model}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    },
    onSelect: () => {
      runLaunch(row, undefined, undefined, variant)
    }
  }))
}

export function ClaudeVariantMenuItems({
  launches: { variants, row },
  disabled,
  runLaunch
}: {
  launches: ClaudeVariantMenuLaunches
  disabled?: boolean
  runLaunch: TabAgentMenuLaunch
}): React.JSX.Element | null {
  if (!row || variants.length === 0) {
    return null
  }
  return (
    <>
      {variants.map((variant) => (
        <DropdownMenuItem
          key={`claude-variant:${variant.id}`}
          variant="launch"
          disabled={disabled}
          onSelect={(event) => {
            if (runLaunch(row, undefined, undefined, variant) === false) {
              event.preventDefault()
            }
          }}
          title={variantTitle(variant)}
        >
          <AgentIcon agent="claude" size={14} />
          <span className="min-w-0 flex-1 truncate">{variant.label}</span>
        </DropdownMenuItem>
      ))}
    </>
  )
}
