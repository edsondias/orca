import { z } from 'zod'
import { desktopNotificationStreamUnsubscribe } from '../notifications/desktop-notification-stream-operations'
import type { RpcClient } from '../transport/rpc-client'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'
import type { CarMissedSinceParams } from './car-notification-catch-up'

// The rows stay unknown: the car's catch-up validates each one exactly as it does live stream events.
const carMissedNotificationsSchema = z
  .looseObject({ notifications: z.array(z.unknown()).optional() })
  .nullish()

const carMissedNotificationsRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'notifications.car-missed-since',
    method: 'notifications.getMissedSince',
    acceptance: 'success-result-or-skip',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('car-missed-notifications', carMissedNotificationsSchema)
  })
)

/** Events the car's stream missed since the watermark; null when the host could not answer. */
export async function fetchMissedCarNotifications(
  client: RpcClient,
  params: CarMissedSinceParams
): Promise<unknown[] | null> {
  const reply = await carMissedNotificationsRead.request(client, {
    ...params,
    includeDesktopSuppressed: true
  })
  const read = carMissedNotificationsRead.interpret(reply)
  return read.accepted ? (read.value?.notifications ?? []) : null
}

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
