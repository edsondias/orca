import type { MobileNotificationDispatchEvent } from './push/notifications/runtime-mobile-notification-controller'

export function buildAgentExitedMobileNotification(input: {
  ptyId: string
  generation: number
  attribution: { worktreeId?: string }
  /** Workspace or terminal name, so the phone and car can tell which agent exited. */
  label?: string | null
  emittedAt: number
}): MobileNotificationDispatchEvent {
  return {
    type: 'notification',
    source: 'agent-exited',
    title: input.label ? `Agent exited in ${input.label}` : 'Agent exited',
    body: '',
    emittedAt: input.emittedAt,
    // Why: phones that do not opt into desktop-suppressed events, and the 5 s legacy cooldown, never see this.
    desktopAllowed: false,
    // Unique per exit so a later exit in the same pane is not deduplicated.
    notificationId: `agent-exited:${input.ptyId}:${input.generation}:${input.emittedAt}`,
    ...(input.attribution.worktreeId ? { worktreeId: input.attribution.worktreeId } : {})
  }
}
