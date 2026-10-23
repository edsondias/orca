import { createElement } from 'react'
import { Text } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { carSessionStore } from '../car/car-session-store'
import CarSettingsScreen from './car-settings-screen'

vi.mock('react-native', () => ({
  Switch: 'Switch',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value }
}))
vi.mock('../storage/preferences', () => ({
  loadCarModeEnabled: async () => true,
  saveCarModeEnabled: async () => {}
}))
vi.mock('./mobile-settings-menu', () => ({
  MobileSettingsFrame: ({ children }: { children: unknown }) => children
}))

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  carSessionStore.setStartProblem(null)
})

function texts(): string[] {
  return (renderer?.root.findAllByType(Text) ?? []).map((node) =>
    [node.props.children].flat().join('')
  )
}

it('states the battery cost and why Car mode could not start', async () => {
  await act(async () => {
    renderer = create(createElement(CarSettingsScreen))
  })
  expect(texts()).toContain(
    'Keeps a connection and a notification active for Android Auto until you turn it off'
  )
  expect(texts().some((text) => text.includes('Open Orca once with the car connected'))).toBe(false)
  await act(async () => carSessionStore.setStartProblem('service-start-refused'))
  expect(texts().some((text) => text.includes('Open Orca once with the car connected'))).toBe(true)
})
