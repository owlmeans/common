import { appendContextual } from '@owlmeans/context'
import { AuthenFailed } from '@owlmeans/auth'
import type { OtpService } from '@owlmeans/auth-otp'
import { OTP_SERVICE, OTP_RESOURCE, OTP_TTL_SECONDS, OTP_CODE_LENGTH } from '@owlmeans/auth-otp'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { MailerService } from '@owlmeans/mailer'
import { MAILER_SERVICE } from '@owlmeans/mailer'
import type { OtpConfig, OtpContext } from './types.js'

interface OtpRecord extends ResourceRecord {
  id: string
  code: string
}

const codeKey = (email: string): string =>
  email.toLowerCase().replace(/[^a-z0-9]/g, '_')

export const makeOtpService = (alias = OTP_SERVICE): OtpService => {
  const service: OtpService = appendContextual<OtpService>(alias, {
    issueChallenge: async (email: string): Promise<void> => {
      const ctx = service.ctx as OtpContext<OtpConfig>
      const resourceAlias = ctx.cfg.otp?.resourceAlias ?? OTP_RESOURCE
      const mailerAlias = ctx.cfg.otp?.mailerAlias ?? MAILER_SERVICE
      const resource = ctx.resource<RedisResource<OtpRecord>>(resourceAlias)
      const mailer = ctx.service<MailerService>(mailerAlias)

      const code = generateCode()
      const id = codeKey(email)

      // Upsert: delete previous code if any, then create fresh.
      try {
        await resource.delete(id)
      } catch { /* key may not exist */ }

      await resource.create({ id, code }, { ttl: OTP_TTL_SECONDS })

      await mailer.send({
        to: email,
        subject: 'Your login code',
        text: `Your one-time login code is: ${code}\n\nIt expires in ${OTP_TTL_SECONDS / 60} minutes.`,
        html: `<p>Your one-time login code is: <strong>${code}</strong></p><p>It expires in ${OTP_TTL_SECONDS / 60} minutes.</p>`,
      })
    },

    verifyChallenge: async (email: string, code: string): Promise<void> => {
      const ctx = service.ctx as OtpContext<OtpConfig>
      const resourceAlias = ctx.cfg.otp?.resourceAlias ?? OTP_RESOURCE
      const resource = ctx.resource<RedisResource<OtpRecord>>(resourceAlias)

      const id = codeKey(email)
      const record = await resource.load(id)

      if (record == null || record.code !== code.trim()) {
        throw new AuthenFailed('otp:code')
      }

      // Consume: delete so the code cannot be reused.
      try {
        await resource.delete(id)
      } catch { /* already expired */ }
    },
  })

  return service
}

const generateCode = (): string => {
  const digits = Math.floor(Math.random() * Math.pow(10, OTP_CODE_LENGTH))
  return String(digits).padStart(OTP_CODE_LENGTH, '0')
}
