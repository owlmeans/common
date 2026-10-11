export interface MentionHelper {
  encode: (id: string, nickname: string) => string
  parse: (body: string) => string[]
  nicknameKey: (nickname: string) => string
}
