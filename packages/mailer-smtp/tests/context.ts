import { smtpGate } from '@owlmeans/test-integration'
import type { IntegrationGate, SmtpEnv } from '@owlmeans/test-integration'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { MAILER_SERVICE } from '@owlmeans/mailer'
import { makeSmtpMailerService } from '@owlmeans/mailer-smtp'
import type { SmtpConfig, SmtpMailerService, SmtpSettings } from '@owlmeans/mailer-smtp'

/**
 * Live relay gate. Every variable empty means the delivery specs self-skip with a
 * printed reason — never a failure. When it is open these specs send REAL mail, so
 * `SMTP_TEST_TO` is required rather than optional.
 */
export const gate: IntegrationGate<SmtpEnv> = smtpGate()

/** Never logged, never asserted on — only handed to the transport. */
export const settings = (): SmtpSettings => ({
  host: gate.env.SMTP_HOST as string,
  port: gate.env.SMTP_PORT ?? '465',
  secure: gate.env.SMTP_SECURE ?? 'true',
  user: gate.env.SMTP_USER as string,
  pass: gate.env.SMTP_PASSWORD as string,
  from: gate.env.SMTP_FROM as string,
})

export const recipient = (): string => gate.env.SMTP_TEST_TO as string

export interface Booted {
  context: ServerContext<ServerConfig>
  mailer: SmtpMailerService
}

/** Real context, real service registration — the same path a server app takes. */
export const boot = async (overrides: Partial<SmtpSettings> = {}): Promise<Booted> => {
  const cfg = config('smtp-test') as SmtpConfig
  cfg.smtp = { ...settings(), ...overrides }

  const context = makeServerContext(cfg) as unknown as ServerContext<ServerConfig>
  context.registerService(makeSmtpMailerService(MAILER_SERVICE) as never)

  context.configure()
  await context.init()

  return { context, mailer: context.service<SmtpMailerService>(MAILER_SERVICE) }
}
