import { module } from '@owlmeans/module'
import { route } from '@owlmeans/route'
import { API_CONFIG } from './consts.js'

export const modules = [
  module(route(API_CONFIG, '/assets/config.json'), { sticky: true }),
]
