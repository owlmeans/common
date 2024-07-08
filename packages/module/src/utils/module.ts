import { CommonModule } from '../types.js'

export const isModule = (module: Object): module is CommonModule => '_module' in module
