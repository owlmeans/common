import { apiConfigPlugin } from '@owlmeans/api-config'

apiConfigPlugin({
  allow: {
    i18n: {
      defaultLng: true,
      defaultNs: true,
      fallbackLng: true,
      supportedLngs: true,
    },
  },
})
