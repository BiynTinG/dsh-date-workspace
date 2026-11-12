/**
 * Host half of `dsh-date-workspace`.
 *
 * Two jobs:
 *
 * 1. Publish the row's `baseDir` to the page as one index-injection global
 *    (`globalThis.__DSH_DATE_WORKSPACE__`), so the browser half never carries a
 *    hard-coded path.
 * 2. Create the dated directory over one loopback-only route
 *    (`POST /api/dsh-date-workspace/ensure`).
 *
 * The second job is a route rather than the directory-picker capability on
 * purpose: the composed picker may be the `native` backend, whose capability is
 * `pick()` alone — no `list()` and no `createDirectory()`. Asking it to create a
 * folder fails with `directory-picker/unavailable`. A workspace directory is a
 * plain `mkdir`, so this half owns it and every picker backend works.
 *
 * `baseDir` is a **volatile** Config field: the Settings machinery can rewrite
 * it live (persisted into the profile's Cordis patch) and this half reads the
 * current value through the volatile reference on every read.
 *
 * Configure it in the profile's `cordis.patch.yml`:
 *
 *     - id: date-workspace
 *       config:
 *         baseDir: D:\工作空间\dsh-work
 *
 * or edit it in the Web GUI: Plugins → 日期工作区 → 基目录.
 */

import { mkdir, stat } from "node:fs/promises";
import { isAbsolute, join, parse, resolve, sep } from "node:path";
import z from "@deepseek-ai/schemastery";

/** Built-in base directory, used when the row declares no `baseDir`. */
export const DEFAULT_BASE = "D:\\工作空间\\dsh-work";

/** Global the browser half reads. */
export const GLOBAL_KEY = "__DSH_DATE_WORKSPACE__";

/** The one route this half serves. */
export const ROUTE = "/api/dsh-date-workspace/ensure";

/** Largest accepted request body. */
const BODY_MAX_BYTES = 8 * 1024;

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

/** @param {string} address - socket remote address. @returns {boolean} whether it is loopback. */
function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  const text = address.toLowerCase();
  if (text === "::1") return true;
  const v4 = text.startsWith("::ffff:") ? text.slice(7) : text;
  const parts = v4.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}

/**
 * Request fence: a loopback socket, no forwarding header, a loopback `Host`, and
 * a same-origin `Origin` when the browser sent one. The route creates real
 * directories, so a LAN client must not reach it.
 * @param {import("node:http").IncomingMessage} request - incoming request.
 * @returns {boolean} whether the request may proceed.
 */
function isTrusted(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false;
  if (request.headers["cf-connecting-ip"] !== void 0 || request.headers["x-forwarded-for"] !== void 0) return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let authority;
  try {
    authority = new URL(`http://${host}`);
  } catch {
    return false;
  }
  const hostname = authority.hostname;
  const loopbackHost = hostname === "localhost" || hostname === "[::1]" || isLoopbackAddress(hostname);
  if (!loopbackHost) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === authority.host;
  } catch {
    return false;
  }
}

/** @param {import("node:http").ServerResponse} res - response. @param {number} status - code. @param {unknown} body - JSON body. */
function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

/** @param {import("node:http").IncomingMessage} req - request. @returns {Promise<unknown>} parsed JSON body. */
async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > BODY_MAX_BYTES) throw new Error("body too large");
    chunks.push(chunk);
  }
  if (total === 0) return void 0;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Create every missing segment below the path's root; existing segments are kept.
 * @param {string} target - fully qualified directory path.
 * @returns {Promise<string>} the target as created.
 */
async function ensureDirectory(target) {
  if (typeof target !== "string" || target.trim() === "") throw new Error("path is required");
  const raw = target.trim();
  // Check the caller's spelling: `resolve` would silently accept a relative path.
  if (!isAbsolute(raw)) throw new Error(`not a fully qualified path: ${target}`);
  const full = resolve(raw);
  if (full === parse(full).root) throw new Error("refusing to create a filesystem root");
  await mkdir(full, { recursive: true });
  const info = await stat(full);
  if (!info.isDirectory()) throw new Error(`not a directory: ${full}`);
  return full;
}

/**
 * Serve the ensure route: `POST { path }` → `{ ok, path }` or `{ ok: false, error }`.
 * @param {import("node:http").IncomingMessage} req - request.
 * @param {import("node:http").ServerResponse} res - response.
 * @returns {Promise<void>} settlement after the response.
 */
async function handleEnsure(req, res) {
  if (!isTrusted(req)) {
    writeJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  try {
    const body = await readJson(req);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("body must be { path }");
    const created = await ensureDirectory(body.path);
    writeJson(res, 200, { ok: true, path: created });
  } catch (error) {
    writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Publish the base directory and, when a Web server is composed, register the
 * ensure route.
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
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: ROUTE,
      handler: handleEnsure
    }), "date-workspace: ensure route");
  });
}

/** Exported for the test harness; not part of the plugin surface. */
export const internals = { ensureDirectory, isTrusted, handleEnsure, ROUTE, BODY_MAX_BYTES, join, sep };
