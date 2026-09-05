export const filterObject = <T extends {}>(obj: T, keep?: string[]): T =>
  Object.entries(obj).reduce((obj, [key, value]) => {
    if (value == null && !keep?.includes(key)) {
      return obj
    }
    return { ...obj, [key]: value }
  }, {} as T)
