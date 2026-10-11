import type { TargetLayout } from '../consts.js'
import type { TargetLayoutManifest } from '../types.js'

/** The layouts a target tree may be in: what each asserts, and which one a tree is. */
export interface TargetLayoutHelper {
  /** What one layout asserts. */
  targetManifest: (layout: TargetLayout) => TargetLayoutManifest
  /**
   * Whether a tree of this layout can still be GENERATED INTO.
   *
   * A legacy target is served, built and run exactly like any other — that is the whole point of
   * verifying it against its own manifest. What no longer works on it is code generation: every
   * path builder, every stamped import specifier and the whole `docs/` metadata tree name the
   * current layout's packages, so a story implemented into a legacy tree writes files into
   * directories its workspace does not contain. That fails silently — the build succeeds, the
   * story completes and the application does not change — which is why the platform refuses
   * instead, and names re-initialization as the one cure.
   *
   * `undefined` reads as current: a publisher that predates layout reporting omits it, and reading
   * that silence as legacy would refuse development for every slot already in the cluster.
   */
  isLegacyLayout: (layout: TargetLayout | string | undefined | null) => boolean
  /**
   * Which layout a tree is in, from its files alone — IO-free, like everything else here.
   *
   * A tree that shows neither probe is reported as the current layout: it is not a target at all,
   * and the integrity report is what has to say so, in the vocabulary of the layout the platform
   * generates today.
   */
  detectTargetLayout: (files: Record<string, string | null>) => TargetLayout
  /** `<slug>-<package>` — the only way a workspace package is ever named, in either layout. */
  targetPackageName: (slug: string, pkg: string) => string
  /** Everything one package must declare, once the root manifest has named the slug. */
  targetRequiredDeps: (slug: string, pkg: string, layout?: TargetLayout) => string[]
}
