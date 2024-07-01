import { BasicModule } from './types.js'
export { module as makeBasicModule } from '@owlmeans/module'

export const isModule = (module: Object): module is BasicModule => 'ctx' in module
