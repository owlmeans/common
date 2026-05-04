import { randomBytes } from 'node:crypto'

/**
 * Short random suffix safe to use in DB names, Redis key prefixes, and S3
 * object prefixes. Default 6 hex chars is enough to avoid collisions
 * between parallel test runs while staying within MongoDB's 38-char DB
 * name limit when combined with a sensible prefix.
 */
export const randomNamespace = (prefix: string, length: number = 6): string => {
  const suffix = randomBytes(Math.max(1, Math.ceil(length / 2)))
    .toString('hex')
    .slice(0, length)
  return `${prefix}_${suffix}`
}
