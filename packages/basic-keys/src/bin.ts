
import { KeyType } from './consts.js'
import { makeKeyPairModel } from './model.js'

const keyPair = makeKeyPairModel()

console.log('Private export: ', keyPair.export())
console.log('Public export: ', keyPair.exportPublic())
console.log('DID export: ', keyPair.exportAddress())


const xChachaKey = makeKeyPairModel(KeyType.XCHACHA)
console.log('XChaha key export: ', xChachaKey.export())
