import type { RouteModel } from '@owlmeans/route'
import type { Context, Service } from '@owlmeans/context'
import { BasicModule } from './utils/types.js'

export interface Module extends BasicModule {
    route: RouteModel
    guards?: string[]
    gate?: string
    handler?: ModuleHandler
}

export interface ModuleMatch {
    <R, P, C extends Context>(req: R, res: P, ctx: C): Promise<boolean>
}

export interface ModuleHandler {
    <R, P, C extends Context>(req: R, res: P, ctx: C): Promise<C | void>
}

export interface ModuleAssert {
    <R, P, C extends Context>(req: R, res: P, ctx: C): Promise<void>
}

export interface GuardService extends Service {
    match: ModuleMatch
    hanlder: ModuleMatch
}

export interface GateService extends Service {
    /**
     * @throws {Error}
     */
    assert: ModuleAssert
}
