import { apiConfigPlugin } from '@owlmeans/api-config'

apiConfigPlugin({
  allow: {
    flowConfig: {
      queryParam: true,
      services: true,
      modules: true,
      pathes: true,
      defaultFlow: true,
    },
  },
})
