import { TARGET_API_BASE } from '@owlmeans/viable-common'

/**
 * The runtime safety net `ensure` appends, so a first commit never captures dependencies, build
 * output, secrets or the connector's own scratch files.
 *
 * `.viable/connect.json` is deliberately NOT here: it is the project's identity, it holds no
 * secret, and a developer who clones their own repository elsewhere should find it. The two files
 * beside it are — a run record names pids on one machine, and the local keypair is a credential.
 */
export const IGNORE_BASELINE = [
  'node_modules/',
  'dist/',
  'build/',
  '.env',
  '.viable/run.json',
  '.viable/local.json',
  'tsconfig.tsbuildinfo',
]

/**
 * Why a local repository is never pushed, pulled or given a remote.
 *
 * DELIBERATE DIFFERENCE from the publisher, which does all three against a token the platform
 * holds. A slot's volume is the platform's and its remote is a repository the platform created;
 * a developer's checkout is THEIRS, its remote is whatever they configured, and pushing to it
 * would mean the platform writing to a repository nobody here was asked about — with the
 * developer's own credential helper supplying the authentication. So the platform touches none
 * of it: whoever owns the directory owns its remotes.
 */
export const REMOTE_REFUSAL = 'This project lives on your own machine, so the platform does not touch its '
  + 'git remotes. Push, pull and remote configuration are yours to run.'

/**
 * Why a local target is never cloned into.
 *
 * A clone exists for one case — the platform fetching an origin repository onto a slot's volume it
 * owns — and a local target has already answered that question: the directory the connector was
 * started in IS the origin, and there is nothing to fetch. Overwriting it with a remote tree would
 * replace a developer's working copy, including whatever they had not committed.
 *
 * Answered as TEXT beside {@link REMOTE_REFUSAL} and never thrown, for the same reason: a caller
 * that received an exception would retry something that can never succeed, while a `cloned: false`
 * in the shape it already parses is a fact its next step can read.
 */
export const CLONE_REFUSAL = 'This project is the directory the connector was started in, so there is '
  + 'nothing to clone into it. Its sources are already here.'

/** Where the api answers. The worker has a health port but no api base in front of it. */
export const TARGET_HEALTH_PATH = `/${TARGET_API_BASE}/healtz`

/**
 * The one reason a script refuses that is NOT a verdict about the code.
 *
 * A build with nothing to build on is an ordinary no-op that the next trigger repeats correctly —
 * it happens between attaching to a fresh clone and the first install. It must not be reported as
 * a failed build, or the connector announces broken code during a window in which nothing was
 * even attempted.
 */
export const NOT_INSTALLED_REASON = "cannot run: the target's dependencies are not installed yet"

/**
 * Output ceiling for every validate/build child process.
 *
 * Node's default is 1 MiB, and a target project with a few hundred type errors exceeds it: the
 * child is killed and the fixer receives `stdout maxBuffer length exceeded` instead of the errors
 * it is supposed to repair.
 */
export const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024

/** One-shot script ceiling. A build that outlives it is wedged, not slow. */
export const BUILD_TIMEOUT = 300_000
