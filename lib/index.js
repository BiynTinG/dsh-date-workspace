/**
 * Host half of `dsh-date-workspace`.
 *
 * The interaction lives in the browser half; this half publishes the row's
 * configuration to the page as one index-injection global
 * (`globalThis.__DSH_DATE_WORKSPACE__`), so the base directory is a plugin
 * config value instead of a constant baked into the client bundle.
 *
 * Configure it on the Loader row:
 *
 *     - id: date-workspace
 *       name: dsh-date-workspace
 *       config:
 *         baseDir: D:\工作空间\dsh-work
 *
 * The browser half falls back to this value unless the dialog's own
 * "remembered" choice (`localStorage['dsh-date-workspace:base']`) exists.
 */

/** Built-in base directory, used when the row declares no `baseDir`. */
export const DEFAULT_BASE = "D:\\工作空间\\dsh-work";

/** Global the browser half reads. */
export const GLOBAL_KEY = "__DSH_DATE_WORKSPACE__";

/**
 * @param {string | undefined} value - configured base directory.
 * @returns {string} the trimmed non-empty value, or the built-in default.
 */
function resolveBase(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : DEFAULT_BASE;
}

/**
 * Publish `{ baseDir }` into the boot index for every rendered page.
 * @param {object} ctx - host root context.
 * @param {{ baseDir?: string } | undefined} config - the Loader row's config.
 * @returns {void}
 */
export function apply(ctx, config) {
  const baseDir = resolveBase(config?.baseDir);
  ctx.on("webserver/index-inject", (table) => {
    table.push({
      kind: "global",
      name: GLOBAL_KEY,
      value: { baseDir }
    });
  });
}
