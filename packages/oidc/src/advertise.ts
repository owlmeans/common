import { apiConfigPlugin, every } from '@owlmeans/api-config'

apiConfigPlugin({
  allow: {
    oidc: {
      clientCookie: true,
      restrictedProviders: true,
      providers: every({
        entityId: true,
        service: true,
        discoveryUrl: true,
        basePath: true,
        clientId: true,
        redirectUri: true,
        extraScopes: true,
        authEndpoint: true,
        tokenEndpoint: true,
        userinfoEndpoint: true,
        idOverride: true,
        def: true,
        label: true,
        icon: true,
        order: true,
        hidden: true,
      }, value => value != null && typeof value === 'object' && (value as { internal?: boolean }).internal !== true),
    },
  },
})
