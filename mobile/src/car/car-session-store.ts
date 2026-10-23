export type CarSessionPhase = 'inactive' | 'active' | 'ending'
/** Why the native car session is not running although the phase wants it; shown on the Car mode screen. */
export type CarSessionStartProblem = 'service-start-refused' | null
export type CarSessionSnapshot = {
  phase: CarSessionPhase
  carModeEnabled: boolean
  projecting: boolean
  startProblem: CarSessionStartProblem
}

// Covers a loose USB cable without tearing down the host socket and the car conversations.
export const CAR_SESSION_END_GRACE_MS = 60_000

type Deps = { setTimer: typeof setTimeout; clearTimer: typeof clearTimeout }

export function createCarSessionStore(deps: Deps) {
  let snapshot: CarSessionSnapshot = {
    phase: 'inactive',
    carModeEnabled: false,
    projecting: false,
    startProblem: null
  }
  let endTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()

  const emit = (next: CarSessionSnapshot) => {
    const changed = next.phase !== snapshot.phase || next.startProblem !== snapshot.startProblem
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
      emit({ ...snapshot, ...inputs, phase: 'active' })
      return
    }
    if (snapshot.phase === 'inactive') {
      emit({ ...snapshot, ...inputs, phase: 'inactive' })
      return
    }
    emit({ ...snapshot, ...inputs, phase: 'ending' })
    if (!endTimer) {
      endTimer = deps.setTimer(() => {
        endTimer = null
        emit({ ...snapshot, phase: 'inactive', startProblem: null })
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
    setStartProblem: (startProblem: CarSessionStartProblem) => emit({ ...snapshot, startProblem }),
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
