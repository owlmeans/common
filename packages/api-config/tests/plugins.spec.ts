import { describe, expect, test } from 'bun:test'
import { AppType, CONFIG_RECORD } from '@owlmeans/context'
import '@owlmeans/flow'
import '@owlmeans/i18n'
import '@owlmeans/oidc'
import '@owlmeans/payment'
import { advertisedConfig, every, selectApiConfig } from '@owlmeans/api-config'
import type { CommonConfig } from '@owlmeans/config'

describe('@owlmeans/api-config plugins', () => {
  test('keeps only registered config and public nested fields', () => {
    const result = advertisedConfig({
      debug: { all: true, supervisor: true, serverTrace: 'private' },
      brand: { name: 'Example' },
      security: {
        unsecure: false,
        auth: { login: { title: 'Sign in' }, serverOnly: 'private' },
      },
      services: {
        api: {
          service: 'api', type: AppType.Backend, host: 'api.example.test', port: 443,
          base: 'api', internalHost: 'api.cluster.local', serverOnly: 'private',
        },
        worker: {
          service: 'worker', type: AppType.Backend, host: 'worker.cluster.local',
          internalHost: 'worker.cluster.local', port: 3000,
        },
      },
      plugins: [
        { id: 'web', type: AppType.Frontend, value: 'safe' },
        { id: 'server', type: AppType.Backend, value: 'private' },
      ],
      oidc: {
        clientCookie: { interaction: { name: 'oidc', ttl: 60 } },
        accountLinkingService: 'private',
        providers: [
          { clientId: 'public', service: 'iam', secret: 'secret', apiClientId: 'admin' },
          { clientId: 'internal', service: 'iam', internal: true, secret: 'secret' },
        ],
      },
      flowConfig: { defaultFlow: 'signin', services: { auth: 'web' }, serverOnly: 'private' },
      i18n: { defaultLng: 'en', supportedLngs: ['en', 'pl'], serverOnly: 'private' },
      [CONFIG_RECORD]: [
        { id: 'plan:starter', recordType: 'plan', price: 10 },
        { id: 'flow:signin', recordType: 'flow' },
      ],
      smtp: { host: 'smtp.example.test', pass: 'secret' },
      queue: { queues: [{ name: 'private' }] },
      dbs: [{ host: 'db.example.test', secret: 'secret' }],
      secrets: { key: 'secret' },
    } as unknown as CommonConfig)

    expect(result).toEqual({
      debug: { all: true, supervisor: true },
      brand: { name: 'Example' },
      security: { unsecure: false, auth: { login: { title: 'Sign in' } } },
      services: {
        api: { service: 'api', type: AppType.Backend, host: 'api.example.test', port: 443, base: 'api' },
      },
      plugins: [{ id: 'web', type: AppType.Frontend, value: 'safe' }],
      oidc: {
        clientCookie: { interaction: { name: 'oidc', ttl: 60 } },
        providers: [{ clientId: 'public', service: 'iam' }],
      },
      flowConfig: { defaultFlow: 'signin', services: { auth: 'web' } },
      i18n: { defaultLng: 'en', supportedLngs: ['en', 'pl'] },
      [CONFIG_RECORD]: [{ id: 'plan:starter', recordType: 'plan', price: 10 }],
    })
  })

  test('can remove nested secrets after allowing a collection', () => {
    const result = selectApiConfig({
      integrations: [
        { name: 'public', token: 'secret', options: { endpoint: 'https://example.test', key: 'private' } },
      ],
    }, {
      allow: { integrations: every(true) },
      deny: { integrations: every({ token: true, options: { key: true } }) },
    })

    expect(result).toEqual({
      integrations: [{ name: 'public', options: { endpoint: 'https://example.test' } }],
    })
  })
})
