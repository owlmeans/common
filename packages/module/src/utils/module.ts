import { Module } from '../types.js'

export const isModule = (module: Object): module is Module => '_module' in module
