// Set tray attention before gates and fan out to phones before desktop early returns.
import type { BrowserWindow } from 'electron'
import type {
  NotificationDispatchRequest,
  NotificationDispatchResult,
  NotificationSettings
} from '../../shared/notification-settings-types'
import type { MobileNotificationPromptRef } from '../../shared/mobile-notification-prompt-ref'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { buildNotificationOptions } from '../ipc/notification-options'
import { translateMain } from '../i18n/main-i18n'
import { reserveNotificationCooldown } from '../../shared/notification-burst-cooldown'
import { toHostSessionPaneKey } from '../../shared/terminal-surface-id'

export type NotificationDeliveryDependencies = {
  readNotificationSettings: () => NotificationSettings
  findActiveWindow: () => BrowserWindow | null
  isWindowVisible: (window: BrowserWindow | null) => boolean
  setTrayAttention: (attention: boolean) => void
  isNotificationSupported: () => boolean
  dispatchMobileNotification: OrcaRuntimeService['dispatchMobileNotification'] | null
  readAuthorizationStatus: () => Promise<
    'authorized' | 'denied' | 'not-determined' | 'unknown' | null
  >
  recordDeliveryOutcome: (outcome: 'delivered' | 'failed') => void
  deliverNative: (
    request: NotificationDispatchRequest,
    options: ReturnType<typeof buildNotificationOptions>,
    settings: NotificationSettings
  ) => NotificationDispatchResult | Promise<NotificationDispatchResult>
  /** Resolves which pending prompt a phone reply would answer; undefined when none is fenceable. */
  resolvePromptRef?: (
    request: NotificationDispatchRequest
  ) => MobileNotificationPromptRef | undefined
  platform: NodeJS.Platform
  now: () => number
  /** Called for each actual desktop banner or mobile alert. */
  recordAnnounced?: (request: NotificationDispatchRequest) => void
}

export type NotificationDeliveryService = {
  dispatch: (
    request: NotificationDispatchRequest
  ) => NotificationDispatchResult | Promise<NotificationDispatchResult>
}

export function createNotificationDeliveryService(
  deps: NotificationDeliveryDependencies
): NotificationDeliveryService {
  const recentDesktopNotifications = new Map<string, number>()
  const recentMobileNotifications = new Map<string, number>()

  // A failed lookup must never cost the user the notification itself.
  const resolvePromptRefSafely = (
    request: NotificationDispatchRequest
  ): MobileNotificationPromptRef | undefined => {
    try {
      return deps.resolvePromptRef?.(request)
    } catch (error) {
      console.warn('[notifications] Could not resolve the prompt reference', error)
      return undefined
    }
  }

  // Keyed news is announced once by its producer, so only its own repeat may collapse it.
  const dedupeKeyFor = (request: NotificationDispatchRequest): string =>
    request.attentionKey ?? request.worktreeId ?? request.worktreeLabel ?? 'global'

  const deliverNativeAndRecord = (
    request: NotificationDispatchRequest,
    options: ReturnType<typeof buildNotificationOptions>,
    settings: NotificationSettings
  ): NotificationDispatchResult | Promise<NotificationDispatchResult> => {
    const recordIfDelivered = (result: NotificationDispatchResult): NotificationDispatchResult => {
      if (result.delivered) {
        deps.recordAnnounced?.(request)
      }
      return result
    }
    const result = deps.deliverNative(request, options, settings)
    return result instanceof Promise ? result.then(recordIfDelivered) : recordIfDelivered(result)
  }

  return {
    dispatch: (request) => {
      // Desktop gates must not suppress tray attention.
      if (request.source === 'agent-task-complete' || request.source === 'terminal-bell') {
        if (!deps.isWindowVisible(deps.findActiveWindow())) {
          deps.setTrayAttention(true)
        }
      }

      const settings = deps.readNotificationSettings()
      const hostMuted =
        request.notificationSourceId !== undefined &&
        settings.mutedNotificationSourceIds.includes(request.notificationSourceId)
      // Machine mutes leave mobile eligibility and its cooldown unchanged.
      const desktopAllowed =
        settings.enabled &&
        (request.source !== 'agent-task-complete' || settings.agentTaskComplete) &&
        (request.source !== 'terminal-bell' || settings.terminalBell)

      const notificationOptions = buildNotificationOptions(request, translateMain)

      // Desktop focus need not silence phones; execution hosts retire their own delivered alerts.
      if (
        !request.mobileDeliveredByHost &&
        deps.dispatchMobileNotification &&
        request.source !== 'test'
      ) {
        if (
          reserveNotificationCooldown(
            recentMobileNotifications,
            JSON.stringify([
              desktopAllowed,
              request.source,
              request.agentState,
              dedupeKeyFor(request)
            ]),
            deps.now()
          )
        ) {
          // Only a blocked session has a prompt a phone could answer.
          const promptRef =
            request.agentSessionId && request.agentState === 'blocked'
              ? { kind: 'structured' as const, sessionId: request.agentSessionId }
              : request.agentState === 'blocked' || request.agentState === 'waiting'
                ? resolvePromptRefSafely(request)
                : undefined
          deps.dispatchMobileNotification({
            type: 'notification',
            emittedAt: deps.now(),
            source: request.source,
            ...(!desktopAllowed ? { desktopAllowed: false } : {}),
            title: notificationOptions.title,
            body: notificationOptions.body,
            worktreeId: request.worktreeId,
            // The phone asks the execution host for tabs, which never name this window's mirror tabs.
            ...(request.paneKey ? { paneKey: toHostSessionPaneKey(request.paneKey) } : {}),
            ...(request.executionHost ? { executionHost: request.executionHost } : {}),
            ...(request.notificationId ? { notificationId: request.notificationId } : {}),
            // Push needs real agent state to distinguish input/completion and silence running agents.
            ...(request.agentState ? { agentState: request.agentState } : {}),
            ...(request.attentionKey ? { attentionKey: request.attentionKey } : {}),
            ...(request.structuredOrigin ? { structuredOrigin: request.structuredOrigin } : {}),
            ...(promptRef ? { promptRef } : {})
          })
          deps.recordAnnounced?.(request)
        }
      }

      if (!desktopAllowed || hostMuted) {
        return {
          delivered: false,
          reason: !settings.enabled ? 'disabled' : hostMuted ? 'host-muted' : 'source-disabled'
        }
      }

      const browserWindow = deps.findActiveWindow()
      if (
        settings.suppressWhenFocused &&
        request.isActiveWorktree &&
        browserWindow &&
        browserWindow.isFocused()
      ) {
        return { delivered: false, reason: 'suppressed-focus' }
      }

      // Explicit Settings tests bypass burst deduplication.
      if (request.source !== 'test') {
        // Collapse unkeyed worktree events across sources; attention keys isolate their own repeats.
        if (
          !reserveNotificationCooldown(
            recentDesktopNotifications,
            dedupeKeyFor(request),
            deps.now()
          )
        ) {
          return { delivered: false, reason: 'cooldown' }
        }
      }

      if (!deps.isNotificationSupported()) {
        return { delivered: false, reason: 'not-supported' }
      }

      if (deps.platform !== 'darwin') {
        return deliverNativeAndRecord(request, notificationOptions, settings)
      }
      // macOS swallows denied/undecided notifications; allow the renderer fallback instead.
      return deps.readAuthorizationStatus().then((authorization) => {
        if (authorization === 'denied' || authorization === 'not-determined') {
          deps.recordDeliveryOutcome('failed')
          return { delivered: false, reason: 'blocked-by-system' }
        }
        return deliverNativeAndRecord(request, notificationOptions, settings)
      })
    }
  }
}
