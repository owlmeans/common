import { appMapHelper } from '../topology/apps.js'
import type { ConnectAppsHelper } from './apps/types.js'

export const createConnectAppsHelper = (): ConnectAppsHelper => {
  const areasOf: ConnectAppsHelper['areasOf'] = map => appMapHelper.keysOf(map).map(key => {
    const area = appMapHelper.areaOf(map, key)

    return {
      key,
      kind: area.kind,
      segment: area.segment,
      app: appMapHelper.homeAppOf(map, key).name,
      path: appMapHelper.areaUrlOf(map, key),
      ...(area.label != null && area.label !== '' ? { label: area.label } : {}),
      ...(area.marker != null && area.marker !== '' ? { marker: area.marker } : {}),
    }
  })

  return { areasOf }
}

export const connectAppsHelper = createConnectAppsHelper()
