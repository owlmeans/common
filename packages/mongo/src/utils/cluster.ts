import type { DbConfig } from '@owlmeans/config'
import { MongoServerError } from 'mongodb'
import type { MongoClient } from 'mongodb'
import type { MongoMeta } from '../types.js'
import { DEF_REPLSET } from '../consts.js'
import { port } from './config.js'

export const setUpCluster = async (client: MongoClient, config: DbConfig): Promise<boolean> => {
  const meta: MongoMeta | undefined = config.meta

  console.log('mongo: try to set up cluster...')
  await client.connect()
  console.log('...conntected')
  const admin = client.db('admin').admin()

  try {
    const result = await admin.replSetGetStatus()
    console.log('replicaset status: ', result.ok)

    return true
  } catch (e) {
    try {
      if (e instanceof MongoServerError && 'NotYetInitialized' === e.codeName) {
        // INITIALIZE REPLICASET
        const hosts = config.host as string[]

        const outcome = await admin.command({
          replSetInitiate: {
            _id: meta?.replicaSet ?? DEF_REPLSET,
            members: hosts.map((host, index) => ({ _id: index, host: port(host, config) }))
          }
        })
        console.log('replicaset intialization outcome: ', outcome.ok)
      } else if (e instanceof MongoServerError && e.codeName === 'InvalidReplicaSetConfig') {
        // FIX REPLICASET IF NODES CHANGED THEIR ADDRESSES
        const hosts = config.host as string[]

        const { config: currentConfig } = await admin.command({ replSetGetConfig: 1 });
        currentConfig.version++

        currentConfig.members = hosts.map((host, index) => ({
          ...currentConfig.members[index], _id: index, host: port(host, config)
        }))

        const outcome = await admin.command({ replSetReconfig: currentConfig, force: true })
        console.log('replicaset re-intialization outcome: ', outcome.ok)
      } else {
        throw e
      }
    } catch (e) {
      if (e instanceof MongoServerError && e.codeName === 'ConfigurationInProgress') {
        console.log('configuring...')
        // @TODO 2 seconds can't be enough
        await new Promise(resolve => setTimeout(resolve, 2000))
      } else {
        throw e
      }
    }

    return false
  }
}
