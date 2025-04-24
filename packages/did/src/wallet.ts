import { DIDInitializationError, DIDKeyError, DIDWalletError } from './errors.js'
import type { DIDKeyModel, DIDStore, DIDWallet, KeyMeta, KeyPairRecord, MakeDIDWalletOptions } from './types.js'
import { generateMnemonic, toEntropy, toMnemonic, toSeed } from './utils/mnemonic.js'
import { KEY_OWL, MASTER } from './consts.js'
import { plugins } from './plugins/index.js'
import { ed25519owlPluginBuilder } from './plugins/ed25519owl.js'
import { produceKey } from './utils/key.js'
import { makeDidKeyModel } from './model.js'
import { mataToPath, matchMeta } from './utils.js'

export const makeWallet = async (store: DIDStore, opts?: MakeDIDWalletOptions) => {
  if (await store.master.load(MASTER) == null) {
    if (!opts?.force && !opts?.allowEmpty) {
      throw new DIDInitializationError('master')
    }
  }
  
  const type = opts?.type ?? KEY_OWL
  if (plugins[type] == null) {
    if (opts?.allowCustomType) {
      plugins[type] = ed25519owlPluginBuilder(type)
    }
  }

  const wallet: DIDWallet = {
    store, 

    generate: async opts => {
      const mnemonic = generateMnemonic(opts)

      const seed = {
        entropy: toEntropy(mnemonic),
        seed: toSeed(mnemonic)
      }

      const master = produceKey(seed.seed, type)
      await store.master.save({ id: MASTER, ...master, ...seed })
    },

    mnemonic: async crash => {
      const master = await store.master.get(MASTER)
      if (master.seed == null) {
        if (crash) {
          throw new DIDWalletError('mnemonic')
        }
        return false
      }

      return toMnemonic(master.seed)
    },

    master: async () => makeDidKeyModel(await store.master.get(MASTER)),

    add: async (key, meta) => {
      if (key.keyPair == null || key.keyPair.privateKey == null) {
        throw new DIDWalletError('key:non-managable')
      }
      const stored = await store.keys.load(key.exportAddress())
      if (stored != null) {
        throw new DIDWalletError('key:exists')
      }
      await store.keys.create({ id: key.exportAddress(), ...key.keyPair })
      await store.meta.create({ ...meta, id: key.exportAddress() })
    },

    meta: async key => {
      if (typeof key === 'string') {
        if (null == await store.keys.load(key)) {
          throw new DIDWalletError('no:key')
        }

        return store.meta.get(key)
      }

      return wallet.meta(key.exportAddress())
    },

    update: async (key, meta) => {
      if (key.keyPair == null) {
        throw new DIDWalletError('key:non-managable')
      }
      const did = key.exportAddress()
      const returnKey = await store.keys.save({ id: did, ...key.keyPair })
      const returnMeta = await store.meta.save({ ...meta, id: did })

      return [makeDidKeyModel(returnKey), returnMeta]
    },

    get: async did => {
      if (await store.keys.load(did) == null) {
        throw new DIDWalletError('no:key')
      }
      return makeDidKeyModel(await store.keys.get(did))
    },

    find: async meta => {
      const result = await store.meta.list(
        Object.fromEntries(Object.entries(meta).filter(([_, v]) => typeof v !== 'boolean'))
      )

      const keys = await Promise.all(result.items.filter(item => matchMeta(item, meta))
        .map(async meta => store.keys.get(meta.id)))

      return keys.map(key => makeDidKeyModel(key))
    },

    provide: async meta => {
      const found = await wallet.find(meta)
      if (found.length === 0) {
        const path = mataToPath(meta)
        const master = await wallet.master()
        const key = master.derive(path)
        if (meta.name == null) {
          throw new DIDKeyError('no:name')
        }
        const metaToSave: KeyMeta = {
          ...meta, id: meta.id ?? key.exportAddress(), name: meta.name
        }
        await wallet.add(key, metaToSave)

        return [key]
      }

      return found
    },

    remove: async did => {
      if (typeof did === 'object') {
        if ("keyPair" in did) {
          return wallet.remove(did.exportAddress())
        }
        const keys = await wallet.find(did as KeyMeta)
        const key = await keys.reduce<Promise<DIDKeyModel | null>>(async (_, key) => {
          return wallet.remove(key)
        }, Promise.resolve(null))
        if (key == null) {
          throw new DIDWalletError('no:key')
        }
        return key
      }
      const key = await store.keys.load(did)
      if (key == null) {
        throw new DIDWalletError('no:key')
      }
      await store.keys.delete(key)
      const model = makeDidKeyModel(key)
      await store.meta.delete(model.exportAddress())

      return model
    },

    all: async () => {
      const result: KeyPairRecord[] = []
      let more = false
      do {
        const found = await store.keys.list({ pager: { page: Math.floor(result.length / 100), size: 100 } })
        result.push(...found.items)
        more = found.pager?.total != null && found.pager.total > result.length
      } while (more)

      return result.map(key => makeDidKeyModel(key))
    }
  }

  if (opts?.force) {
    await wallet.generate(opts.mnemonic)
  }

  return wallet
}
