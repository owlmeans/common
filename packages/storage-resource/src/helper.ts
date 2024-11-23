import { StoredFile, StoredFileWithData } from './types.js'

export const stripData = <
  Input extends StoredFileWithData,
  Output extends StoredFile
>(file: Input): Output => {
  const intermediate: Input = { ...file }

  if (intermediate.format) {
    delete intermediate.format
  }

  intermediate.instances = Object.fromEntries(
    Object.entries(file.instances).map(([key, instance]) => [key, {
      size: instance.size,
      alias: instance.alias,
      url: instance.url,
    }])
  )

  return JSON.parse(JSON.stringify(intermediate)) as Output
}
