
import {ComponentError} from '@owlmeans/client'

export class UploaderError extends ComponentError {
  public static override typeName: string = `${ComponentError.typeName}Uploader`

  constructor(message: string = 'error') {
    super(`uploader:${message}`)
    this.type = UploaderError.typeName
  }
}

export class FileUploadingError extends UploaderError {
  public static override typeName: string = `${UploaderError.typeName}FileUploading`

  public original: Error | undefined

  constructor(message: string = 'error') {
    super(`file-uploading:${message}`)
    this.type = FileUploadingError.typeName
  }
}

ComponentError.registerErrorClass(UploaderError)
ComponentError.registerErrorClass(FileUploadingError)
