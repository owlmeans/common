
import { makeKeyPairModel } from './model.js'

const keyPair = makeKeyPairModel()

console.log('Private export: ', keyPair.export())
console.log('Public export: ', keyPair.exportPublic())
console.log('DID export: ', keyPair.exportAddress())
