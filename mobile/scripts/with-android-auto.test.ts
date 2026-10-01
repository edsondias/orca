import { describe, expect, it } from 'vitest'
// oxlint-disable-next-line typescript/no-require-imports -- the plugin is CommonJS, as Expo loads it.
const plugin = require('../plugins/with-android-auto.js')

function emptyManifest() {
  return {
    manifest: {
      $: {},
      'uses-permission': [],
      application: [{ $: { 'android:name': '.MainApplication' } }]
    }
  }
}

describe('with-android-auto', () => {
  it('declares Android Auto, the car session service, the reply receiver and permissions', () => {
    const manifest = plugin.applyAndroidAutoManifest(emptyManifest())
    const app = manifest.manifest.application[0]
    expect(app['meta-data']).toContainEqual({
      $: {
        'android:name': 'com.google.android.gms.car.application',
        'android:resource': '@xml/automotive_app_desc'
      }
    })
    expect(app.service[0].$['android:foregroundServiceType']).toBe('connectedDevice')
    expect(app.receiver[0].$['android:exported']).toBe('false')
    const permissions = manifest.manifest['uses-permission'].map(
      (p: { $: Record<string, string> }) => p.$['android:name']
    )
    expect(permissions).toEqual(
      expect.arrayContaining([
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
        'android.permission.CHANGE_NETWORK_STATE'
      ])
    )
  })

  it('is idempotent across repeated prebuilds', () => {
    const once = plugin.applyAndroidAutoManifest(emptyManifest())
    const twice = plugin.applyAndroidAutoManifest(once)
    const app = twice.manifest.application[0]
    expect(app['meta-data']).toHaveLength(1)
    expect(app.service).toHaveLength(1)
    expect(app.receiver).toHaveLength(1)
    expect(twice.manifest['uses-permission']).toHaveLength(3)
  })

  it('describes a notification-only car app in phase 1', () => {
    expect(plugin.AUTOMOTIVE_APP_DESC_XML).toContain('<uses name="notification"/>')
    expect(plugin.AUTOMOTIVE_APP_DESC_XML).not.toContain('template')
  })
})
