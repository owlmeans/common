/** Context-service alias of the {@link LlmReaderService}. */
export const LLM_READER_SERVICE = 'owlmeans-llm-reader-service'

/** What kind of page a document is — the answer of `classify`. */
export enum PageType {
  Landing = 'landing',
  Article = 'article',
  Listing = 'listing',
  CategoryIndex = 'category-index',
  Product = 'product',
  Docs = 'docs',
  App = 'app',
  SearchResults = 'search-results',
  Profile = 'profile',
  Forum = 'forum',
  Form = 'form',
  Login = 'login',
  Error = 'error',
  Media = 'media',
  Other = 'other',
}

/** What a picture is for on its page. */
export enum ImageRole {
  Logo = 'logo',
  Hero = 'hero',
  Illustration = 'illustration',
  Photo = 'photo',
  Product = 'product',
  Avatar = 'avatar',
  Icon = 'icon',
  Thumbnail = 'thumbnail',
  Banner = 'banner',
  Background = 'background',
  Chart = 'chart',
  Screenshot = 'screenshot',
  Tracking = 'tracking',
  Decorative = 'decorative',
  Other = 'other',
}

/** Where a picture comes from in the document. */
export enum ImageKind {
  Img = 'img',
  Picture = 'picture',
  Svg = 'svg',
  Background = 'background',
  Meta = 'meta',
  Icon = 'icon',
  Poster = 'poster',
  Input = 'input',
}

/** The landmark a node sits in. */
export enum PageRegion {
  Header = 'header',
  Nav = 'nav',
  Main = 'main',
  Article = 'article',
  Aside = 'aside',
  Footer = 'footer',
  Dialog = 'dialog',
  Form = 'form',
  Other = 'other',
}

/** What a link is for, as far as its markup tells. */
export enum LinkKind {
  Nav = 'nav',
  Content = 'content',
  Footer = 'footer',
  Social = 'social',
  Action = 'action',
  Pagination = 'pagination',
  Asset = 'asset',
  Anchor = 'anchor',
  Other = 'other',
}

/** How the analyst reads a page: one pass over its text, or an agent exploring its DOM. */
export enum ReaderMode {
  Text = 'text',
  Dom = 'dom',
  /** Text first; the DOM agent when required fields came back empty. */
  Auto = 'auto',
}

/** The model-backed tasks of a reader — each may run on its own model role. */
export enum ReaderTask {
  Describe = 'describe',
  Extract = 'extract',
  Classify = 'classify',
  Links = 'links',
  Images = 'images',
  Vision = 'vision',
  Design = 'design',
}

/** How a proxy is picked from a list. */
export enum ProxyStrategy {
  RoundRobin = 'round-robin',
  Random = 'random',
  /** The same key keeps the same proxy while it is healthy (rendezvous hashing). */
  Sticky = 'sticky',
}

/**
 * The body sections of a DESIGN.md, in order: the Google Labs spec's eight, then the two this
 * package adds for a page read from the outside.
 */
export const DESIGN_SECTIONS = Object.freeze([
  'Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components',
  "Do's and Don'ts", 'Responsive Behavior', 'Agent Prompt Guide',
] as const)

/** The model role a reader task runs on when the caller maps none. */
export const DEFAULT_READER_ROLE = 'reader'

/** What one link became when it was collected. */
export enum CollectKind {
  /** An HTML page with its stylesheets, fonts and pictures, rewritten to local paths, and `bundle.json`. */
  Bundle = 'bundle',
  /** One file, streamed as it was served. */
  File = 'file',
  /** The files a {@link ReaderSource} expanded the link to — an S3 prefix, a Drive folder. */
  Source = 'source',
}

/** What a collected file is for. */
export enum CollectRole {
  Page = 'page',
  Stylesheet = 'stylesheet',
  Font = 'font',
  Image = 'image',
  /** Anything else a stylesheet points at. */
  Asset = 'asset',
  /** A direct link's file, or one a source expanded to. */
  File = 'file',
  /** `bundle.json`. */
  Manifest = 'manifest',
}

/** What happened to one collected item. */
export enum CollectStatus {
  Written = 'written',
  /** Over a limit, or not something the bundle keeps. */
  Skipped = 'skipped',
  /** The address guard (or the pinned fetch) refused it. */
  Refused = 'refused',
  Failed = 'failed',
}
