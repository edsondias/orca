import type { OrcaRuntimeService } from '../../../orca-runtime'
import {
  commitMobileInputFloorClaim,
  isTerminalInputLockedForClient,
  resolveMobileFloorClientId,
  type MobileInputFloorClaimHolder
} from './terminal-input-delivery'
import type { TerminalViewportClient } from './terminal-stream-types'

export type MobileInputFloorHooks = {
  /** Write hooks that claim and commit the mobile input floor; empty without a floor client. */
  hooks: {
    reserveWrite?: (ptyId: string) => void
    afterWrite?: () => Promise<void>
  }
  rollback: () => void
}

export function createMobileInputFloorHooks(
  runtime: OrcaRuntimeService,
  floorClientId: string | null
): MobileInputFloorHooks {
  const claim: MobileInputFloorClaimHolder = { current: null }
  return {
    hooks: floorClientId
      ? {
          reserveWrite: (ptyId) => {
            const next = runtime.beginMobileInputFloor(ptyId, floorClientId)
            if (!next) {
              throw new Error('mobile_input_floor_unavailable')
            }
            claim.current = next
          },
          afterWrite: () => commitMobileInputFloorClaim(claim)
        }
      : {},
    rollback: () => claim.current?.rollback()
  }
}

export type MobileTerminalInputAdmission = MobileInputFloorHooks & {
  /** True when another client holds the terminal, so nothing may be written. */
  locked: boolean
}

export function admitMobileTerminalInput(
  runtime: OrcaRuntimeService,
  handle: string,
  client: TerminalViewportClient | undefined
): MobileTerminalInputAdmission {
  // Why: a stale handle must fail with terminal_handle_stale, not evaluate driver/lock state against the wrong PTY (#7718).
  const leaf = runtime.resolveLiveLeafForHandle(handle)
  const driver = leaf?.ptyId ? runtime.getDriver(leaf.ptyId) : null
  const locked = leaf?.ptyId ? isTerminalInputLockedForClient(runtime, leaf.ptyId, client) : false
  const floorClientId = leaf?.ptyId ? resolveMobileFloorClientId(driver, client) : null
  return { locked, ...createMobileInputFloorHooks(runtime, floorClientId) }
}
