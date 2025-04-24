
import { KeyType } from './consts.js'
import { makeKeyPairModel } from './model.js'

const keyPair = makeKeyPairModel()

console.info('Private export: ', keyPair.export())
console.info('Public export: ', keyPair.exportPublic())
console.info('DID export: ', keyPair.exportAddress())


const xChachaKey = makeKeyPairModel(KeyType.XCHACHA)
console.info('XChaha key export: ', xChachaKey.export())
