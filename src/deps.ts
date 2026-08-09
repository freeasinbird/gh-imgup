/** The API I/O dependencies every module's DI interface repeats: a fetch
 * implementation and a warning sink. Shared here so their production
 * defaults (`fetch`, and a stderr writer) are defined once; module-specific
 * dependencies (e.g. cleanup's TTY/confirm) stay in their own module. */
export interface ApiIoDeps {
  fetchImpl?: typeof fetch;
  warn?: (message: string) => void;
}

/** Fill in the production defaults for the common API I/O dependencies. */
export function apiIoDefaults(deps: ApiIoDeps): {
  fetchImpl: typeof fetch;
  warn: (message: string) => void;
} {
  return {
    fetchImpl: deps.fetchImpl ?? fetch,
    warn:
      deps.warn ??
      ((m) => {
        process.stderr.write(m);
      }),
  };
}
