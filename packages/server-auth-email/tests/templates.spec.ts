import { describe, expect, test } from 'bun:test'
import { EMAIL_AUTH_LOCALES } from '@owlmeans/auth-email'
import { createEmailMailTemplates } from '../src/templates.js'
import { EMAIL_MAIL_LANGUAGES } from '../src/templates/consts.js'
import type { EmailMailPurpose } from '../src/types.js'

const PURPOSES: EmailMailPurpose[] = ['sign-in', 'confirm-set', 'confirm-change', 'confirm-remove', 'confirm-device-pin']

describe('@owlmeans/server-auth-email — mail templates', () => {
  test('every purpose in all eight languages: {{code}} and {{minutes}} in text and html, the code never in the subject', () => {
    const templates = createEmailMailTemplates()

    expect(Object.keys(EMAIL_MAIL_LANGUAGES).sort()).toEqual([...EMAIL_AUTH_LOCALES].sort())
    for (const locale of EMAIL_AUTH_LOCALES) {
      const subjects = new Set<string>()
      for (const purpose of PURPOSES) {
        const message = templates.messageOf(purpose, locale)
        expect(message.text).toContain('{{code}}')
        expect(message.html).toContain('<strong>{{code}}</strong>')
        expect(message.text).toContain('{{minutes}}')
        expect(message.html).toContain('{{minutes}}')
        expect(message.subject).not.toContain('{{code}}')
        expect(message.subject.trim()).not.toBe('')
        subjects.add(message.subject)
      }
      // One subject per purpose, all different, in every language.
      expect(subjects.size).toBe(PURPOSES.length)
    }
    // The languages are really translated, not copies of the English text.
    expect(new Set(EMAIL_AUTH_LOCALES.map(locale => templates.messageOf('sign-in', locale).text)).size).toBe(EMAIL_AUTH_LOCALES.length)
  })

  test('the language is the request locale\'s primary subtag when one exists, otherwise English', () => {
    const templates = createEmailMailTemplates()

    expect(templates.localeOf('pl-PL')).toBe('pl')
    expect(templates.localeOf(' UK ')).toBe('uk')
    expect(templates.localeOf('pt-BR')).toBe('en')
    expect(templates.localeOf(undefined)).toBe('en')
    expect(templates.messageOf('sign-in', 'xx').subject).toBe(templates.messageOf('sign-in', 'en').subject)
  })

  test('an application replaces a mail per purpose and locale, or adds a language', () => {
    const own = { subject: 'Kod', text: 'Kod: {{code}}', html: '<b>{{code}}</b>' }
    const italian = { subject: 'Il tuo codice', text: 'Codice {{code}}', html: '<p>{{code}}</p>' }
    const templates = createEmailMailTemplates({ 'sign-in': { pl: own, it: italian } })

    expect(templates.messageOf('sign-in', 'pl')).toEqual(own)
    expect(templates.messageOf('confirm-set', 'pl').subject).toBe('Potwierdź nowe hasło')
    expect(templates.messageOf('sign-in', 'it-IT')).toEqual(italian)
    expect(templates.messageOf('confirm-set', 'it').subject).toBe('Confirm your new password')
  })
})
