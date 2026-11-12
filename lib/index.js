/**
 * Host half of `dsh-date-workspace`.
 *
 * Publishes the row's `baseDir` to the page as one index-injection global
 * (`globalThis.__DSH_DATE_WORKSPACE__`), so the browser half never carries a
 * hard-coded path.
 *
 * `baseDir` is a **volatile** Config field: the Settings machinery can rewrite
 * it live (persisted into the profile's Cordis patch) and this half reads the
 * current value through the volatile reference on every index render.
 *
 * Configure it in the profile's `cordis.patch.yml`:
 *
 *     - id: date-workspace
 *       config:
 *         baseDir: D:\工作空间\dsh-work
 *
 * or edit it in the Web GUI: Plugins → 日期工作区 → 基目录.
 */

import z from "@deepseek-ai/schemastery";

/** Built-in base directory, used when the row declares no `baseDir`. */
export const DEFAULT_BASE = "D:\\工作空间\\dsh-work";

/** Global the browser half reads. */
export const GLOBAL_KEY = "__DSH_DATE_WORKSPACE__";

/** Settings namespace === Loader entry id; lives under the `Config` name below. */
export const Config = z.object({
  baseDir: z.string().default(DEFAULT_BASE).volatile()
});

/**
 * @param {unknown} value - configured base directory, possibly a volatile reference.
 * @returns {string} the trimmed non-empty value, or the built-in default.
 */
function resolveBase(value) {
  const raw = typeof value === "object" && value !== null && typeof value.get === "function" ? value.get() : value;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : DEFAULT_BASE;
}

/**
 * Publish `{ baseDir }` into the boot index for every rendered page.
 * @param {object} ctx - host root context.
 * @param {{ baseDir?: unknown } | undefined} config - the Loader row's config.
 * @returns {void}
 */
export function apply(ctx, config) {
  const baseDir = () => resolveBase(config?.baseDir);
  ctx.on("webserver/index-inject", (table) => {
    table.push({
      kind: "global",
      name: GLOBAL_KEY,
      value: { baseDir: baseDir() }
    });
  });
}
