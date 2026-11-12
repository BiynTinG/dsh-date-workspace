/**
 * Host half of `dsh-date-workspace`.
 *
 * The plugin's behaviour lives entirely in the browser half (it fills the
 * workspace directory-flow holes declared by `@deepseek-ai/dsh-client-ui-workspace`
 * and reuses the Host directory primitives). This node half stays an empty
 * `apply` so the Loader keeps a row to activate and the client-modules scan
 * sees the package's `dsh.client` declaration.
 */

/** @returns {void} */
export function apply() {}
