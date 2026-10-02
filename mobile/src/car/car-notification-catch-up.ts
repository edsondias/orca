import type { CarNotificationEvent } from './car-conversation-store'
import type { CarBridgeHost } from './car-session-bridge'

export type CarMissedSinceParams = { lastSeenSeq: number; epoch?: string }

type Deps = {
  subscribe(host: CarBridgeHost, onEvent: (event: unknown) => void): () => void
  /** Missed events since the watermark, or null when the host could not say. */
  fetchMissed(host: CarBridgeHost, params: CarMissedSinceParams): Promise<unknown[] | null>
  now(): number
}

type Watermark = { firstAttachedAt: number; epoch?: string; seq?: number }

function field<T>(
  event: unknown,
  key: string,
  guard: (value: unknown) => value is T
): T | undefined {
  if (typeof event !== 'object' || event === null || !(key in event)) {
    return undefined
  }
  const value: unknown = Reflect.get(event, key)
  return guard(value) ? value : undefined
}
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isString = (value: unknown): value is string => typeof value === 'string'

function isCarNotificationEvent(value: unknown): value is CarNotificationEvent {
  return field(value, 'type', isString) === 'notification'
}

/** Per-host stream attach that replays, through notifications.getMissedSince, what a dropped stream missed. */
export function createCarNotificationCatchUp(deps: Deps) {
  // Survives detach and re-attach of a host for the whole car session.
  const watermarks = new Map<string, Watermark>()

  return {
    attach(host: CarBridgeHost, onNotification: (event: CarNotificationEvent) => void): () => void {
      const previous = watermarks.get(host.hostId)
      const mark: Watermark = previous ?? { firstAttachedAt: deps.now() }
      watermarks.set(host.hostId, mark)
      let detached = false
      let catchingUp = previous !== undefined
      const held: unknown[] = []

      const accept = (event: unknown, replayed: boolean) => {
        if (field(event, 'type', isString) === 'ready') {
          const epoch = field(event, 'epoch', isString)
          // A new epoch is a restarted host whose counter began again.
          if (epoch && epoch !== mark.epoch) {
            mark.epoch = epoch
            mark.seq = undefined
          }
          return
        }
        const seq = field(event, 'notificationSeq', isNumber)
        const epoch = field(event, 'notificationEpoch', isString)
        if (seq !== undefined) {
          const sameEpoch = epoch === undefined || epoch === mark.epoch
          if (sameEpoch && mark.seq !== undefined && seq <= mark.seq) {
            return
          }
          mark.epoch = epoch ?? mark.epoch
          mark.seq = seq
        }
        const emittedAt = field(event, 'emittedAt', isNumber)
        // A replay without a watermark returns the host's whole buffer; older events predate the car session.
        if (replayed && emittedAt !== undefined && emittedAt < mark.firstAttachedAt) {
          return
        }
        if (isCarNotificationEvent(event)) {
          onNotification(event)
        }
      }

      const unsubscribe = deps.subscribe(host, (event) => {
        if (detached) {
          return
        }
        if (catchingUp && field(event, 'type', isString) !== 'ready') {
          held.push(event)
          return
        }
        accept(event, false)
      })

      if (previous) {
        const params: CarMissedSinceParams = {
          lastSeenSeq: previous.seq ?? 0,
          ...(previous.epoch ? { epoch: previous.epoch } : {})
        }
        void deps
          .fetchMissed(host, params)
          .catch(() => null)
          .then((missed) => {
            if (detached) {
              return
            }
            const ordered = [...(missed ?? [])].sort(
              (a, b) =>
                (field(a, 'notificationSeq', isNumber) ?? 0) -
                (field(b, 'notificationSeq', isNumber) ?? 0)
            )
            for (const event of ordered) {
              accept(event, true)
            }
            catchingUp = false
            for (const event of held.splice(0)) {
              accept(event, false)
            }
          })
      }

      return () => {
        detached = true
        unsubscribe()
      }
    },
    clear: () => watermarks.clear()
  }
}
