import type { AiVaultSessionTitle } from '../../ai-vault/contracts/ai-vault-session-title'
import type { ClaudeVariantMark } from '../../claude-ollama-variants'
import type { Tab } from './tab-types'
import type { TerminalTab } from '../terminal-tab-types'
import { isMeaningfulOpenCodeTerminalTitle } from '../../agent-status/title/providers/opencode-terminal-title'
import { titleShowsNoAgent } from '../../agent-status/process/shell-process-detection'

const CLAUDE_VARIANT_SEPARATOR = ' · '
const GENERIC_CLAUDE_TITLE = 'Claude Code'
const DEFAULT_TERMINAL_TITLE = /^Terminal \d+$/
// Why: Windows consoles title PowerShell by its product name or `PS`, which no process name matches.
const POWERSHELL_CONSOLE_TITLE = /^(?:Administrator: )?(?:PS|Windows PowerShell|PowerShell)$/

// Display only: the raw tab title stays untouched because agent and status detection read it.
function applyClaudeVariantMark(
  mark: ClaudeVariantMark | null | undefined,
  title: string,
  defaultTitle: string | undefined
): string {
  const label = mark?.label.trim()
  if (!label) {
    return title
  }
  // Why: a resolved title is fed back through the same chain by tab-bar and floating-panel projections.
  if (title === label || title.startsWith(`${label}${CLAUDE_VARIANT_SEPARATOR}`)) {
    return title
  }
  const conversation = title.replace(/^[^\p{L}\p{N}]+/u, '')
  // Why: before Claude names the conversation, the tab still shows the shell's or terminal's label.
  const hasNoConversationTitle =
    conversation === '' ||
    conversation === GENERIC_CLAUDE_TITLE ||
    title === defaultTitle?.trim() ||
    DEFAULT_TERMINAL_TITLE.test(title) ||
    titleShowsNoAgent(title) ||
    POWERSHELL_CONSOLE_TITLE.test(title)
  return hasNoConversationTitle ? label : `${label}${CLAUDE_VARIANT_SEPARATOR}${title}`
}

export type TabNameSources = {
  /** A name the user typed into the tab. */
  customTitle?: string | null
  quickCommandLabel?: string | null
  /** The program's own terminal title right now. */
  liveTitle: string
  /** The agent session's title, already checked to belong to this tab's session. */
  sessionTitle?: Pick<AiVaultSessionTitle, 'title' | 'kind'> | null
  generatedTitle?: string | null
}

/** The one name order every tab and agent-row surface uses; '' leaves the plain live title to the caller. */
export function resolveTabNameSource(
  sources: TabNameSources,
  generatedTitlesEnabled: boolean
): string {
  const sessionTitle = sources.sessionTitle?.title.trim() ?? ''
  // Why: a quick-command label only names the tab until the session has a name of its own (a rename or
  // a provider-generated name); a first-prompt stand-in does not replace it. A typed tab name wins over both.
  const sessionNamed = sources.sessionTitle?.kind === 'named'
  return (
    sources.customTitle?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(sources.liveTitle) ? sources.liveTitle : '') ||
    (sessionNamed ? sessionTitle : '') ||
    sources.quickCommandLabel?.trim() ||
    sessionTitle ||
    (generatedTitlesEnabled ? sources.generatedTitle?.trim() : '') ||
    ''
  )
}

export function resolveTerminalTabTitle(
  tab: Pick<
    TerminalTab,
    | 'quickCommandLabel'
    | 'aiVaultTitle'
    | 'generatedTitle'
    | 'title'
    | 'defaultTitle'
    | 'claudeVariant'
  > & {
    customTitle?: string | null
  },
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const customTitle = tab.customTitle?.trim()
  if (customTitle) {
    return customTitle
  }
  const liveTitle = tab.title?.trim() ?? ''
  const title =
    resolveTabNameSource(
      {
        quickCommandLabel: tab.quickCommandLabel,
        liveTitle,
        sessionTitle: tab.aiVaultTitle,
        generatedTitle: tab.generatedTitle
      },
      generatedTitlesEnabled
    ) ||
    liveTitle ||
    fallback
  return applyClaudeVariantMark(tab.claudeVariant, title, tab.defaultTitle)
}

export function resolveUnifiedTabLabel(
  tab:
    | (Pick<
        Tab,
        | 'customLabel'
        | 'quickCommandLabel'
        | 'aiVaultTitle'
        | 'generatedLabel'
        | 'label'
        | 'claudeVariant'
      > &
        Pick<TerminalTab, 'defaultTitle'>)
    | undefined,
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const customLabel = tab?.customLabel?.trim()
  if (customLabel) {
    return customLabel
  }
  const liveLabel = tab?.label?.trim() ?? ''
  const label =
    resolveTabNameSource(
      {
        quickCommandLabel: tab?.quickCommandLabel,
        liveTitle: liveLabel,
        sessionTitle: tab?.aiVaultTitle,
        generatedTitle: tab?.generatedLabel
      },
      generatedTitlesEnabled
    ) ||
    liveLabel ||
    fallback
  return applyClaudeVariantMark(tab?.claudeVariant, label, tab?.defaultTitle)
}
