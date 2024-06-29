
import { makeKeyPairModel } from './model.js'

const keyPair = makeKeyPairModel()

console.log('Private export: ', keyPair.export())
console.log('Public export: ', keyPair.export(true))
