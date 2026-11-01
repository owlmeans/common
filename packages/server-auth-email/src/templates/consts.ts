import type { EmailAuthLocale } from '@owlmeans/auth-email'
import type { EmailMailLanguage } from './types.js'

/** The fallback language of every mail. */
export const EMAIL_MAIL_DEFAULT_LOCALE: EmailAuthLocale = 'en'

/**
 * The built-in words of the sign-in mails, one entry per `EMAIL_AUTH_LOCALES` language. A subject
 * never carries the code: a console mailer logs subjects, and a lock screen shows them.
 */
export const EMAIL_MAIL_LANGUAGES: Readonly<Record<EmailAuthLocale, EmailMailLanguage>> = Object.freeze({
  en: {
    phrases: {
      'sign-in': { subject: 'Your sign-in code', line: 'Your sign-in code is {{code}}.' },
      'confirm-set': { subject: 'Confirm your new password', line: 'Your code to set a password is {{code}}.' },
      'confirm-change': { subject: 'Confirm your password change', line: 'Your code to change your password is {{code}}.' },
      'confirm-remove': { subject: 'Confirm removing your password', line: 'Your code to remove your password is {{code}}.' },
    },
    expires: 'It expires in {{minutes}} minutes.',
    ignoreSignIn: 'If you did not try to sign in, you can ignore this e-mail.',
    ignoreConfirm: 'If you did not ask for this, you can ignore this e-mail.',
  },
  pl: {
    phrases: {
      'sign-in': { subject: 'Twój kod logowania', line: 'Twój kod logowania to {{code}}.' },
      'confirm-set': { subject: 'Potwierdź nowe hasło', line: 'Kod do ustawienia hasła to {{code}}.' },
      'confirm-change': { subject: 'Potwierdź zmianę hasła', line: 'Kod do zmiany hasła to {{code}}.' },
      'confirm-remove': { subject: 'Potwierdź usunięcie hasła', line: 'Kod do usunięcia hasła to {{code}}.' },
    },
    expires: 'Kod wygasa za {{minutes}} min.',
    ignoreSignIn: 'Jeśli to nie Ty próbujesz się zalogować, zignoruj tę wiadomość.',
    ignoreConfirm: 'Jeśli to nie Ty o to prosisz, zignoruj tę wiadomość.',
  },
  ru: {
    phrases: {
      'sign-in': { subject: 'Ваш код для входа', line: 'Ваш код для входа: {{code}}.' },
      'confirm-set': { subject: 'Подтвердите новый пароль', line: 'Код для установки пароля: {{code}}.' },
      'confirm-change': { subject: 'Подтвердите смену пароля', line: 'Код для смены пароля: {{code}}.' },
      'confirm-remove': { subject: 'Подтвердите удаление пароля', line: 'Код для удаления пароля: {{code}}.' },
    },
    expires: 'Код действует {{minutes}} мин.',
    ignoreSignIn: 'Если вы не пытались войти, просто проигнорируйте это письмо.',
    ignoreConfirm: 'Если вы этого не запрашивали, просто проигнорируйте это письмо.',
  },
  be: {
    phrases: {
      'sign-in': { subject: 'Ваш код для ўваходу', line: 'Ваш код для ўваходу: {{code}}.' },
      'confirm-set': { subject: 'Пацвердзіце новы пароль', line: 'Код для ўсталявання пароля: {{code}}.' },
      'confirm-change': { subject: 'Пацвердзіце змену пароля', line: 'Код для змены пароля: {{code}}.' },
      'confirm-remove': { subject: 'Пацвердзіце выдаленне пароля', line: 'Код для выдалення пароля: {{code}}.' },
    },
    expires: 'Код дзейнічае {{minutes}} хв.',
    ignoreSignIn: 'Калі вы не спрабавалі ўвайсці, проста праігнаруйце гэты ліст.',
    ignoreConfirm: 'Калі вы гэтага не прасілі, проста праігнаруйце гэты ліст.',
  },
  uk: {
    phrases: {
      'sign-in': { subject: 'Ваш код для входу', line: 'Ваш код для входу: {{code}}.' },
      'confirm-set': { subject: 'Підтвердьте новий пароль', line: 'Код для встановлення пароля: {{code}}.' },
      'confirm-change': { subject: 'Підтвердьте зміну пароля', line: 'Код для зміни пароля: {{code}}.' },
      'confirm-remove': { subject: 'Підтвердьте видалення пароля', line: 'Код для видалення пароля: {{code}}.' },
    },
    expires: 'Код дійсний {{minutes}} хв.',
    ignoreSignIn: 'Якщо ви не намагалися увійти, просто проігноруйте цей лист.',
    ignoreConfirm: 'Якщо ви цього не запитували, просто проігноруйте цей лист.',
  },
  es: {
    phrases: {
      'sign-in': { subject: 'Tu código de inicio de sesión', line: 'Tu código de inicio de sesión es {{code}}.' },
      'confirm-set': { subject: 'Confirma tu nueva contraseña', line: 'Tu código para crear una contraseña es {{code}}.' },
      'confirm-change': { subject: 'Confirma el cambio de contraseña', line: 'Tu código para cambiar la contraseña es {{code}}.' },
      'confirm-remove': { subject: 'Confirma que quieres eliminar la contraseña', line: 'Tu código para eliminar la contraseña es {{code}}.' },
    },
    expires: 'Caduca en {{minutes}} minutos.',
    ignoreSignIn: 'Si no has intentado iniciar sesión, puedes ignorar este correo.',
    ignoreConfirm: 'Si no lo has pedido tú, puedes ignorar este correo.',
  },
  de: {
    phrases: {
      'sign-in': { subject: 'Ihr Anmeldecode', line: 'Ihr Anmeldecode lautet {{code}}.' },
      'confirm-set': { subject: 'Bestätigen Sie Ihr neues Passwort', line: 'Ihr Code zum Festlegen eines Passworts lautet {{code}}.' },
      'confirm-change': { subject: 'Bestätigen Sie die Passwortänderung', line: 'Ihr Code zum Ändern des Passworts lautet {{code}}.' },
      'confirm-remove': { subject: 'Bestätigen Sie das Entfernen des Passworts', line: 'Ihr Code zum Entfernen des Passworts lautet {{code}}.' },
    },
    expires: 'Er ist {{minutes}} Minuten gültig.',
    ignoreSignIn: 'Wenn Sie sich nicht anmelden wollten, können Sie diese E-Mail ignorieren.',
    ignoreConfirm: 'Wenn Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren.',
  },
  fr: {
    phrases: {
      'sign-in': { subject: 'Votre code de connexion', line: 'Votre code de connexion est {{code}}.' },
      'confirm-set': { subject: 'Confirmez votre nouveau mot de passe', line: 'Votre code pour définir un mot de passe est {{code}}.' },
      'confirm-change': { subject: 'Confirmez le changement de mot de passe', line: 'Votre code pour changer votre mot de passe est {{code}}.' },
      'confirm-remove': { subject: 'Confirmez la suppression du mot de passe', line: 'Votre code pour supprimer votre mot de passe est {{code}}.' },
    },
    expires: 'Il expire dans {{minutes}} minutes.',
    ignoreSignIn: "Si vous n'avez pas essayé de vous connecter, vous pouvez ignorer cet e-mail.",
    ignoreConfirm: "Si vous n'avez rien demandé, vous pouvez ignorer cet e-mail.",
  },
})
