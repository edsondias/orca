import type { MobileNotificationDispatchEvent } from './runtime-mobile-notification-controller'

export function buildAgentExitedMobileNotification(input: {
  ptyId: string
  generation: number
  attribution: { worktreeId?: string }
  emittedAt: number
}): MobileNotificationDispatchEvent {
  return {
    type: 'notification',
    source: 'agent-exited',
    title: 'Agent exited',
    body: '',
    emittedAt: input.emittedAt,
    // Why: phones that do not opt into desktop-suppressed events, and the 5 s legacy cooldown, never see this.
    desktopAllowed: false,
    // Unique per exit so a later exit in the same pane is not deduplicated.
    notificationId: `agent-exited:${input.ptyId}:${input.generation}:${input.emittedAt}`,
    ...(input.attribution.worktreeId ? { worktreeId: input.attribution.worktreeId } : {})
  }
}
