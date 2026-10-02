import * as Notifications from 'expo-notifications'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { OrcaCarMessaging } from '../../modules/orca-car-messaging/src'
import { loadCarModeEnabled } from '../storage/preferences'
import { recordCarSessionLog } from '../transport/persisted-connection-log-store'
import { subscribeToCarNotifications } from './car-notification-stream'
import { sendCarReply } from './car-reply-send'
import { createCarSessionBridge, type CarBridgeHost } from './car-session-bridge'
import { carSessionStore } from './car-session-store'

/** Mounted once at the root; hosts are the connected paired desktops. */
export function useCarSessionBridge(hosts: CarBridgeHost[]): void {
  // Only the phase is trusted: the store notifies on phase changes alone, so other fields can be stale.
  const phase = useSyncExternalStore(
    carSessionStore.subscribe,
    () => carSessionStore.getSnapshot().phase
  )
  const hostsRef = useRef(hosts)
  hostsRef.current = hosts
  const bridgeRef = useRef<ReturnType<typeof createCarSessionBridge> | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadCarModeEnabled()
      .then((enabled) => {
        if (!cancelled) {
          carSessionStore.setCarModeEnabled(enabled)
        }
      })
      .catch(() => {})
    const projection = OrcaCarMessaging.addProjectionListener(({ projecting }) =>
      carSessionStore.setProjecting(projecting)
    )
    return () => {
      cancelled = true
      projection.remove()
    }
  }, [])

  useEffect(() => {
    if (phase === 'inactive') {
      void bridgeRef.current?.stop()
      bridgeRef.current = null
      return
    }
    if (bridgeRef.current) {
      return
    }
    const bridge = createCarSessionBridge({
      messaging: OrcaCarMessaging,
      subscribe: (host, onEvent) => subscribeToCarNotifications(host.client, onEvent),
      send: (hostId, params) =>
        sendCarReply(
          hostsRef.current.find((candidate) => candidate.hostId === hostId),
          params
        ),
      log: recordCarSessionLog,
      canNotify: async () => (await Notifications.getPermissionsAsync()).granted,
      now: Date.now
    })
    bridgeRef.current = bridge
    void bridge.start(hostsRef.current).then((result) => {
      if (result === 'started' || result === 'stopped' || bridgeRef.current !== bridge) {
        return
      }
      // Not started: drop the bridge so the next phase change can try again.
      bridgeRef.current = null
      if (result === 'no-notification-permission') {
        // The settings screen reads this to explain why Car mode stays off.
        carSessionStore.setCarModeEnabled(false)
      }
    })
  }, [phase])

  useEffect(() => {
    bridgeRef.current?.setHosts(hosts)
  }, [hosts])
}
