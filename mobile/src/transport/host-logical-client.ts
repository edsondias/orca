import { AppState, Platform } from 'react-native'
import { connect, type RpcClient } from './rpc-client'
import { createStableLogicalRpcClient } from './stable-logical-rpc-client'
import type { ConnectionLogSink, HostProfile } from './types'
import { directPathForEndpoint } from './mobile-direct-endpoint-probe'
import { startMobileEndpointLifecycle } from './mobile-endpoint-lifecycle'
import { carSessionStore, isCarSessionActive } from '../car/car-session-store'

export function openHostLogicalClient(host: HostProfile, onLog: ConnectionLogSink): RpcClient {
  // Keep app-visible RPC/subscription identity stable while replacing physical sockets.
  const logical = createStableLogicalRpcClient(
    connect(host.endpoint, host.deviceToken, host.publicKeyB64, { onLog }),
    directPathForEndpoint(host.endpoint)
  )
  if (Platform.OS === 'web') {
    return logical
  }

  const endpointLifecycle = startMobileEndpointLifecycle(logical, host, onLog)
  const applyForeground = () =>
    // The car session keeps the host socket as if foreground; Android keeps the process alive via the car service.
    endpointLifecycle.setForeground(AppState.currentState === 'active' || isCarSessionActive())
  applyForeground()
  const appStateSubscription = AppState.addEventListener('change', applyForeground)
  const unsubscribeCarSession = carSessionStore.subscribe(applyForeground)
  const closeLogical = logical.close
  logical.close = () => {
    appStateSubscription.remove()
    unsubscribeCarSession()
    endpointLifecycle.stop()
    closeLogical()
  }
  const notifyLogicalForeground = logical.notifyForeground
  logical.notifyForeground = (reason = 'focus') => {
    // Foreground nudges probe/replace; re-entering setForeground would suspend healthy relays.
    endpointLifecycle.nudge(reason)
    notifyLogicalForeground(reason)
  }
  return logical
}
