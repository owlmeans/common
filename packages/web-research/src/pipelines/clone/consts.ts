/** Media types of a collected file whose bytes are text a model can read as they are. */
export const TEXT_FILE = /^text\/|^application\/(json|xml|x-yaml|yaml|markdown)/

/** File names read as text whatever type they were served with. */
export const TEXT_FILE_NAME = /\.(md|markdown|txt)$/i
