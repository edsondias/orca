export type CarSessionPhase = 'inactive' | 'active' | 'ending'
export type CarSessionSnapshot = {
  phase: CarSessionPhase
  carModeEnabled: boolean
  projecting: boolean
}

// Covers a loose USB cable without tearing down the host socket and the car conversations.
export const CAR_SESSION_END_GRACE_MS = 60_000

type Deps = { setTimer: typeof setTimeout; clearTimer: typeof clearTimeout }

export function createCarSessionStore(deps: Deps) {
  let snapshot: CarSessionSnapshot = { phase: 'inactive', carModeEnabled: false, projecting: false }
  let endTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()

  const emit = (next: CarSessionSnapshot) => {
    const changed = next.phase !== snapshot.phase
    snapshot = next
    if (changed) {
      listeners.forEach((listener) => listener())
    }
  }

  const cancelEnd = () => {
    if (endTimer) {
      deps.clearTimer(endTimer)
      endTimer = null
    }
  }

  const reconcile = (inputs: Pick<CarSessionSnapshot, 'carModeEnabled' | 'projecting'>) => {
    const wanted = inputs.carModeEnabled || inputs.projecting
    if (wanted) {
      cancelEnd()
      emit({ ...inputs, phase: 'active' })
      return
    }
    if (snapshot.phase === 'inactive') {
      emit({ ...inputs, phase: 'inactive' })
      return
    }
    emit({ ...inputs, phase: 'ending' })
    if (!endTimer) {
      endTimer = deps.setTimer(() => {
        endTimer = null
        emit({ ...snapshot, phase: 'inactive' })
      }, CAR_SESSION_END_GRACE_MS)
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setProjecting: (projecting: boolean) =>
      reconcile({ carModeEnabled: snapshot.carModeEnabled, projecting }),
    setCarModeEnabled: (carModeEnabled: boolean) =>
      reconcile({ carModeEnabled, projecting: snapshot.projecting }),
    isActive: () => snapshot.phase !== 'inactive'
  }
}

export const carSessionStore = createCarSessionStore({
  setTimer: setTimeout,
  clearTimer: clearTimeout
})

export function isCarSessionActive(): boolean {
  return carSessionStore.isActive()
}
