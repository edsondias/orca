import * as Notifications from 'expo-notifications'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { OrcaCarMessaging } from '../../modules/orca-car-messaging/src'
import { loadCarModeEnabled } from '../storage/preferences'
import { recordCarSessionLog } from '../transport/persisted-connection-log-store'
import { fetchMissedCarNotifications, subscribeToCarNotifications } from './car-notification-stream'
import { sendCarReply } from './car-reply-send'
import {
  createCarSessionBridge,
  type CarBridgeHost,
  type CarSessionStartResult
} from './car-session-bridge'
import { carSessionStore } from './car-session-store'

/** Mounted once at the root; hosts are the connected paired desktops. */
export function useCarSessionBridge(hosts: CarBridgeHost[]): void {
  // Only the phase is trusted: the store notifies on phase and start-problem changes alone, so other fields can be stale.
  const phase = useSyncExternalStore(
    carSessionStore.subscribe,
    () => carSessionStore.getSnapshot().phase
  )
  const hostsRef = useRef(hosts)
  hostsRef.current = hosts
  const bridgeRef = useRef<ReturnType<typeof createCarSessionBridge> | null>(null)
  const lastStartRef = useRef<CarSessionStartResult | null>(null)
  const [startAttempt, setStartAttempt] = useState(0)

  useEffect(() => {
    // Android 12+ refuses a foreground service started from the background, so try again once Orca is visible.
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'active' &&
        lastStartRef.current === 'service-start-refused' &&
        !bridgeRef.current &&
        carSessionStore.isActive()
      ) {
        setStartAttempt((attempt) => attempt + 1)
      }
    })
    return () => subscription.remove()
  }, [])

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

  useEffect(
    () => () => {
      void bridgeRef.current?.stop()
      bridgeRef.current = null
    },
    []
  )

  useEffect(() => {
    if (phase === 'inactive') {
      void bridgeRef.current?.stop()
      bridgeRef.current = null
      lastStartRef.current = null
      carSessionStore.setStartProblem(null)
      return
    }
    if (bridgeRef.current) {
      return
    }
    const bridge = createCarSessionBridge({
      messaging: OrcaCarMessaging,
      subscribe: (host, onEvent) => subscribeToCarNotifications(host.client, onEvent),
      fetchMissed: (host, params) => fetchMissedCarNotifications(host.client, params),
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
      if (bridgeRef.current !== bridge || result === 'stopped') {
        return
      }
      lastStartRef.current = result
      carSessionStore.setStartProblem(result === 'service-start-refused' ? result : null)
      if (result === 'started') {
        return
      }
      // Not started: drop the bridge so the next phase change or foreground return can try again.
      bridgeRef.current = null
      if (result === 'no-notification-permission') {
        // The settings screen reads this to explain why Car mode stays off.
        carSessionStore.setCarModeEnabled(false)
      }
    })
  }, [phase, startAttempt])

  useEffect(() => {
    bridgeRef.current?.setHosts(hosts)
  }, [hosts])
}
