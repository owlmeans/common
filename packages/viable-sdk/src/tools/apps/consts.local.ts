/** Said where the platform answers without the apps route: it serves the one app every project has. */
export const ONE_APP_PLATFORM = 'This platform reports one application (main) for every project: it'
  + ' predates applications, so there is nothing to list or restart one by one.'

/** Said with {@link ONE_APP_PLATFORM} by a restart: what restarts the one app it has. */
export const RESTART_WHOLE_PREVIEW = 'Restart the whole preview with preview_control { action: restart }.'

/** Said for a local project: the map is the platform's, the processes are this machine's. */
export const LOCAL_MAP_NOTE = 'The sources live on this machine: the platform knows the map, never the'
  + ' processes — run_local serves every application here, each under its path on'

/** The most characters of one cause a line carries; the full text is the structured answer's. */
export const CAUSE_LINE_MAX = 240

/** Said by a local restart asked to rebuild an interface: the build is run_local's here. */
export const LOCAL_APP_RESTART_HINT = 'An interface is rebuilt here by run_local, which builds and serves every'
  + ' application again.'
