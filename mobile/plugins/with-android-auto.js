const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')

const MODULE_PACKAGE = 'expo.modules.orcacarmessaging'
const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.CHANGE_NETWORK_STATE'
]
// Phase 1 is notification messaging only; phase 2 adds <uses name="template"/>.
const AUTOMOTIVE_APP_DESC_XML = '<automotiveApp>\n  <uses name="notification"/>\n</automotiveApp>\n'

function upsertByName(list, entry) {
  const items = list ?? []
  const name = entry.$['android:name']
  return [...items.filter((item) => item.$['android:name'] !== name), entry]
}

function applyAndroidAutoManifest(config) {
  const manifest = config.manifest
  manifest['uses-permission'] = PERMISSIONS.reduce(
    (list, name) => upsertByName(list, { $: { 'android:name': name } }),
    manifest['uses-permission']
  )
  const app = manifest.application[0]
  app['meta-data'] = upsertByName(app['meta-data'], {
    $: {
      'android:name': 'com.google.android.gms.car.application',
      'android:resource': '@xml/automotive_app_desc'
    }
  })
  app.service = upsertByName(app.service, {
    $: {
      'android:name': `${MODULE_PACKAGE}.OrcaCarSessionService`,
      'android:exported': 'false',
      'android:foregroundServiceType': 'connectedDevice'
    }
  })
  app.receiver = upsertByName(app.receiver, {
    $: { 'android:name': `${MODULE_PACKAGE}.CarReplyReceiver`, 'android:exported': 'false' }
  })
  return config
}

function withAndroidAuto(config) {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyAndroidAutoManifest(cfg.modResults)
    return cfg
  })
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml')
      fs.mkdirSync(xmlDir, { recursive: true })
      fs.writeFileSync(path.join(xmlDir, 'automotive_app_desc.xml'), AUTOMOTIVE_APP_DESC_XML)
      return cfg
    }
  ])
}

module.exports = withAndroidAuto
module.exports.applyAndroidAutoManifest = applyAndroidAutoManifest
module.exports.AUTOMOTIVE_APP_DESC_XML = AUTOMOTIVE_APP_DESC_XML
