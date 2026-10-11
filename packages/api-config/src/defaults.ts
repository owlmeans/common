import { AppType } from '@owlmeans/context'
import { PLUGINS } from '@owlmeans/config'
import { apiConfigPlugin, every } from './plugins.js'

const isPublicService = (value: unknown): boolean => {
  if (value == null || typeof value !== 'object') {
    return false
  }
  const service = value as { host?: unknown, internalHost?: unknown }

  // sservice() copies an internal address into host/port. Keep a service only when it has an
  // independently declared public address; otherwise an internal-only peer leaks through host.
  return service.internalHost == null || service.host !== service.internalHost
}

apiConfigPlugin({
  allow: {
    debug: { all: true, i18n: true, supervisor: true },
    brand: true,
    security: {
      unsecure: true,
      auth: { flow: true, enter: true, login: true },
    },
    services: every({
      service: true,
      type: true,
      host: true,
      port: true,
      base: true,
      home: true,
      default: true,
    }, isPublicService),
    [PLUGINS]: every(true, value =>
      value != null && typeof value === 'object' && (value as { type?: AppType }).type === AppType.Frontend
    ),
  },
})
