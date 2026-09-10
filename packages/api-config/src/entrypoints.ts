import { entrypoint } from '@owlmeans/entrypoint'
import { route } from '@owlmeans/route'
import { API_CONFIG } from './consts.js'

export const entrypoints = [
  entrypoint(route(API_CONFIG, '/assets/config.json'), { sticky: true }),
]
