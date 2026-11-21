import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { selectConnectableHostProfiles } from '../host-catalog/host-catalog-selection'
import { loadHostCatalog } from '../host-catalog/host-store'
import type { HostCatalogEntry } from '../host-catalog/host-profile'
import { useAllHostClients } from '../transport/connection/use-all-host-clients'
import type { CarBridgeHost } from './car-session-bridge'
import { carSessionStore } from './car-session-store'
import { useCarSessionBridge } from './use-car-session-bridge'

/** Renders nothing; lives inside RpcClientProvider so the car sees every paired desktop app-wide. */
export function CarSessionBridgeMount(): null {
  const phase = useSyncExternalStore(
    carSessionStore.subscribe,
    () => carSessionStore.getSnapshot().phase
  )
  const [catalog, setCatalog] = useState<HostCatalogEntry[]>([])
  const profiles = useMemo(() => selectConnectableHostProfiles(catalog), [catalog])
  const hostIds = useMemo(() => profiles.map((profile) => profile.id), [profiles])
  const wantedHostIds = useMemo(() => (phase === 'inactive' ? [] : hostIds), [phase, hostIds])

  useEffect(() => {
    if (phase === 'inactive') {
      return
    }
    let cancelled = false
    void loadHostCatalog()
      .then((entries) => {
        if (!cancelled) {
          setCatalog(entries)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [phase])

  const allClients = useAllHostClients(hostIds, {
    autoConnectHostIds: wantedHostIds,
    closeUnusedOnRelease: true
  })
  const hosts = useMemo<CarBridgeHost[]>(
    () =>
      allClients.flatMap((entry) => {
        const profile = profiles.find((candidate) => candidate.id === entry.hostId)
        return entry.state === 'connected'
          ? [
              {
                hostId: entry.hostId,
                client: entry.client,
                deviceToken: profile?.deviceToken
              }
            ]
          : []
      }),
    [allClients, profiles]
  )
  useCarSessionBridge(hosts)
  return null
}
