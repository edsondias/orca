import { desktopNotificationStreamUnsubscribe } from '../notifications/desktop-notification-stream-operations'
import type { RpcClient } from '../transport/rpc-client'

function readSubscriptionId(event: unknown): string | null {
  if (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    event.type === 'ready' &&
    'subscriptionId' in event &&
    typeof event.subscriptionId === 'string'
  ) {
    return event.subscriptionId
  }
  return null
}

/** Desktop-suppressed events are included: an agent that exited while the desktop is focused is still news in the car. */
export function subscribeToCarNotifications(
  client: RpcClient,
  onEvent: (event: unknown) => void
): () => void {
  let subscriptionId: string | null = null
  const unsubscribeStream = client.subscribe(
    'notifications.subscribe',
    { includeDesktopSuppressed: true },
    (event) => {
      subscriptionId = readSubscriptionId(event) ?? subscriptionId
      onEvent(event)
    }
  )
  return () => {
    unsubscribeStream()
    if (subscriptionId && client.getState() === 'connected') {
      // The reply is never read: the stream is already gone locally either way.
      desktopNotificationStreamUnsubscribe.request(client, { subscriptionId }).catch(() => {})
    }
  }
}
