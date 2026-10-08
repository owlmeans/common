import type { MailAttachment, MailAttachmentHelper, MailAttachmentSummary } from './types.js'

export const createMailAttachmentHelper = (): MailAttachmentHelper => {
  const fromBase64 = (text: string): Uint8Array => {
    const binary = atob(text.replace(/\s+/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    return bytes
  }

  const fromHex = (text: string): Uint8Array => {
    const clean = text.replace(/\s+/g, '')
    if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
      throw new SyntaxError('mailer:attachment:hex')
    }
    const bytes = new Uint8Array(clean.length / 2)
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)

    return bytes
  }

  const fromLatin1 = (text: string): Uint8Array => {
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff

    return bytes
  }

  const bytesOf = (attachment: MailAttachment): Uint8Array => {
    const { content } = attachment
    if (typeof content !== 'string') {
      return content
    }
    switch (attachment.encoding?.toLowerCase()) {
      case 'base64': return fromBase64(content)
      case 'hex': return fromHex(content)
      case 'latin1':
      case 'binary': return fromLatin1(content)
      default: return new TextEncoder().encode(content)
    }
  }

  const sizeOf = (attachment: MailAttachment): number => bytesOf(attachment).byteLength

  const describe = (attachments?: MailAttachment[]): MailAttachmentSummary[] =>
    (attachments ?? []).map(attachment => ({
      filename: attachment.filename,
      size: sizeOf(attachment),
      ...(attachment.contentType != null ? { contentType: attachment.contentType } : {}),
    }))

  return { bytesOf, sizeOf, describe }
}

export const mailAttachmentHelper = createMailAttachmentHelper()
