window.__ModuleLoader__.load({
	id: "dsh-date-workspace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		//#region lib/client/date-workspace.js

		/**
		 * Browser half of `dsh-date-workspace`.
		 *
		 * It occupies both workspace directory-flow holes (the sidebar "Add
		 * workspace" flow and the conversation hero picker flow) and replaces the
		 * bare OS chooser with a small dialog that offers:
		 *   1. a dated workspace under a configurable base directory
		 *      (default `D:\工作空间\dsh-work`), named `YYYY-MM-DD`;
		 *   2. the inherited "browse another folder" OS chooser;
		 *   3. cancel.
		 *
		 * The occupant registers at priority -1 so the shipped native/browse
		 * occupant stays loaded as the fallback: the slot registry lets a lower
		 * priority shadow it, and unloading this plugin restores the original
		 * interaction with no composition edit.
		 */

		const STORAGE_KEY = "dsh-date-workspace:base";
		const GLOBAL_KEY = "__DSH_DATE_WORKSPACE__";
		const DEFAULT_BASE = "D:\\工作空间\\dsh-work";

		/** @returns {boolean} whether the reader's UI language is Chinese. */
		function isChinese() {
			const language = typeof navigator === "object" && navigator !== null ? navigator.language : void 0;
			return typeof language !== "string" || /^zh\b/i.test(language);
		}

		/** @returns {Record<string, string>} the dialog copy for the current language. */
		function texts() {
			if (!isChinese()) return {
				title: "New workspace",
				subtitle: "Create a dated workspace, or browse another folder.",
				date: "Date",
				today: "Today",
				tomorrow: "Tomorrow",
				base: "Base directory",
				reset: "Default",
				preview: "Will create",
				create: "Create and open",
				browse: "Browse folders…",
				cancel: "Cancel",
				creating: "Creating…",
				opening: "Opening…",
				hint: "An existing folder is adopted as is.",
				baseRequired: "Enter a base directory.",
				settingsSave: "Save",
				settingsReset: "Restore default",
				settingsSaving: "Saving…",
				settingsLoading: "Reading configuration…",
				settingsSaved: "Saved — the next dialog uses it.",
				settingsFailed: "Not saved. Try again.",
				settingsEffective: "Effective",
				settingsHint: "Plugin row config (config.baseDir). Saving writes the profile's cordis.patch.yml and also clears the value this browser remembered in the dialog."
			};
			return {
				title: "新建工作区",
				subtitle: "按日期创建工作区，或浏览其他文件夹。",
				date: "日期",
				today: "今天",
				tomorrow: "明天",
				base: "基目录",
				reset: "默认",
				preview: "将创建",
				create: "创建并打开",
				browse: "浏览文件夹…",
				cancel: "取消",
				creating: "创建中…",
				opening: "打开中…",
				hint: "目录已存在时直接打开，不覆盖内容。",
				baseRequired: "请填写基目录。",
				settingsSave: "保存",
				settingsReset: "恢复默认",
				settingsSaving: "保存中…",
				settingsLoading: "正在读取配置…",
				settingsSaved: "已保存，下次打开对话框即生效。",
				settingsFailed: "保存失败，请重试。",
				settingsEffective: "当前生效",
				settingsHint: "插件行配置（config.baseDir），保存会写进 profile 的 cordis.patch.yml，并清掉本浏览器在对话框里记住的值。"
			};
		}

		function pad2(value) {
			return String(value).padStart(2, "0");
		}

		/** @returns {string} today's local calendar date as `YYYY-MM-DD`. */
		function todayISO() {
			const now = new Date();
			return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
		}

		/**
		 * Shift a `YYYY-MM-DD` calendar date by whole days in local time.
		 * @param {string} iso - starting date.
		 * @param {number} days - day delta.
		 * @returns {string} the shifted calendar date.
		 */
		function addDays(iso, days) {
			const parts = iso.split("-").map(Number);
			const date = new Date(parts[0], parts[1] - 1, parts[2]);
			date.setDate(date.getDate() + days);
			return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
		}

		/**
		 * @param {string} iso - `YYYY-MM-DD` date.
		 * @returns {string} the localized weekday label.
		 */
		function weekday(iso) {
			const parts = iso.split("-").map(Number);
			const names = isChinese()
				? ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]
				: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
			const index = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
			return names[index] ?? "";
		}

		/**
		 * The base directory the plugin row configures, published by the host
		 * half as an index-injection global. Falls back to the built-in default.
		 * @returns {string} the configured base directory.
		 */
		function configuredBase() {
			const injected = globalThis[GLOBAL_KEY];
			if (typeof injected === "object" && injected !== null && typeof injected.baseDir === "string" && injected.baseDir.trim() !== "") return injected.baseDir.trim();
			return DEFAULT_BASE;
		}

		/**
		 * The remembered base directory, then the plugin row's config, then the
		 * built-in default.
		 * @returns {string} the base directory to prefill.
		 */
		function readBase() {
			try {
				const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
				if (typeof stored === "string" && stored.trim() !== "") return stored;
			} catch (_error) {
				/* storage unavailable: fall back to the configured value */
			}
			return configuredBase();
		}

		/** Drop the remembered override so the plugin row's config applies again. */
		function clearBase() {
			try {
				globalThis.localStorage?.removeItem(STORAGE_KEY);
			} catch (_error) {
				/* storage unavailable: nothing was remembered */
			}
		}

		/** @param {string} value - base directory to remember. */
		function rememberBase(value) {
			try {
				globalThis.localStorage?.setItem(STORAGE_KEY, value);
			} catch (_error) {
				/* storage unavailable: the dialog keeps the typed value for this open */
			}
		}

		/**
		 * Trim a typed base directory and normalize separators.
		 * @param {string} value - raw input.
		 * @returns {string} the base directory without a trailing separator.
		 */
		function normalizeBase(value) {
			let text = String(value ?? "").trim().replace(/[\\/]+$/, "");
			if (/^[A-Za-z]:/.test(text)) text = text.replaceAll("/", "\\");
			return text;
		}

		/**
		 * @param {string} base - base directory.
		 * @param {string} name - child segment.
		 * @returns {string} the joined path in the base directory's separator.
		 */
		function joinPath(base, name) {
			return `${base}${base.includes("\\") ? "\\" : "/"}${name}`;
		}

		/**
		 * Split a fully qualified path into its root and its segments.
		 * @param {string} path - fully qualified Windows or POSIX path.
		 * @returns {{ root: string, segments: string[] } | null} the split path, or null when relative.
		 */
		function splitPath(path) {
			const text = String(path ?? "").trim();
			const windows = /^([A-Za-z]):[\\/]/.exec(text);
			if (windows !== null) return {
				root: `${windows[1].toUpperCase()}:\\`,
				segments: text.slice(3).split(/[\\/]+/).filter(Boolean)
			};
			if (text.startsWith("/")) return {
				root: "/",
				segments: text.slice(1).split(/[\\/]+/).filter(Boolean)
			};
			return null;
		}

		/** @param {unknown} error - any thrown value. @returns {string} one readable line. */
		function describe(error) {
			if (typeof error === "object" && error !== null) {
				const rpc = error.rpcError;
				if (typeof rpc === "object" && rpc !== null && typeof rpc.message === "string") {
					return typeof rpc.code === "string" ? `${rpc.code}: ${rpc.message}` : rpc.message;
				}
				if (typeof error.message === "string") return error.message;
			}
			return String(error);
		}

		/** The host route that creates the directory (`lib/index.js` ROUTE). */
		const ENSURE_ROUTE = "api/dsh-date-workspace/ensure";

		/**
		 * Create the target directory through this plugin's own host route.
		 *
		 * The composed directory picker may be the `native` backend, whose
		 * capability is `pick()` alone — it exposes no `createDirectory`, so
		 * asking the picker to make a folder fails with
		 * `directory-picker/unavailable`. The plugin's host half owns the
		 * `mkdir` instead, which works with every picker backend.
		 * @param {string} fullPath - fully qualified target directory.
		 * @returns {Promise<void>} resolves once the directory exists.
		 */
		async function ensureDirectory(fullPath) {
			const split = splitPath(fullPath);
			if (split === null) throw new Error(`not a fully qualified path: ${fullPath}`);
			const response = await fetch(ENSURE_ROUTE, {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ path: fullPath })
			});
			const answer = await response.json().catch(() => void 0);
			if (!response.ok || answer?.ok !== true) {
				const reason = typeof answer?.error === "string" ? answer.error : `HTTP ${response.status}`;
				throw new Error(`${reason}`);
			}
		}

		const overlayStyle = {
			position: "fixed",
			inset: "0",
			zIndex: "2147482000",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			background: "rgba(0, 0, 0, 0.36)"
		};

		const panelStyle = {
			width: "420px",
			maxWidth: "calc(100vw - 32px)",
			boxSizing: "border-box",
			display: "flex",
			flexDirection: "column",
			gap: "14px",
			padding: "18px 18px 14px",
			borderRadius: "14px",
			border: "0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))",
			background: "var(--dsw-alias-bg-base, #ffffff)",
			color: "var(--dsw-alias-label-primary, #1f1f1f)",
			boxShadow: "0 18px 48px rgba(0, 0, 0, 0.28)",
			font: "14px/1.5 system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif"
		};

		const titleStyle = {
			fontSize: "15px",
			fontWeight: "600",
			lineHeight: "22px"
		};

		const subtitleStyle = {
			fontSize: "12px",
			color: "var(--dsw-alias-label-tertiary, #8a8a8a)"
		};

		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "8px",
			flexWrap: "wrap"
		};

		const labelStyle = {
			width: "52px",
			flex: "none",
			fontSize: "12px",
			color: "var(--dsw-alias-label-secondary, #5c5c5c)"
		};

		const inputStyle = {
			flex: "1 1 150px",
			minWidth: "0",
			height: "30px",
			boxSizing: "border-box",
			padding: "0 8px",
			borderRadius: "8px",
			border: "0.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.45))",
			background: "var(--dsw-alias-bg-base, #ffffff)",
			color: "inherit",
			font: "inherit"
		};

		const buttonStyle = {
			height: "30px",
			padding: "0 12px",
			borderRadius: "9px",
			border: "0.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.45))",
			background: "transparent",
			color: "var(--dsw-alias-label-secondary, #5c5c5c)",
			font: "inherit",
			fontSize: "12px",
			cursor: "pointer"
		};

		const primaryStyle = {
			...buttonStyle,
			border: "0.5px solid var(--dsw-alias-state-business-primary, #4d6bfe)",
			background: "var(--dsw-alias-state-business-primary, #4d6bfe)",
			color: "#ffffff",
			fontWeight: "500"
		};

		const previewStyle = {
			boxSizing: "border-box",
			padding: "8px 10px",
			borderRadius: "9px",
			background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))",
			fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
			fontSize: "12px",
			wordBreak: "break-all",
			color: "var(--dsw-alias-label-secondary, #5c5c5c)"
		};

		const errorStyle = {
			fontSize: "12px",
			lineHeight: "18px",
			color: "var(--dsw-alias-state-error-primary, #d33)"
		};

		const footerStyle = {
			display: "flex",
			alignItems: "center",
			gap: "8px",
			justifyContent: "flex-end",
			flexWrap: "wrap"
		};

		const hintStyle = {
			flex: "1 1 auto",
			fontSize: "11px",
			color: "var(--dsw-alias-label-caption, #9a9a9a)"
		};

		const settingsCardStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "8px",
			padding: "10px 0 2px",
			font: "13px/1.5 system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif"
		};

		const settingsRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "8px",
			flexWrap: "wrap"
		};

		const settingsLabelStyle = {
			flex: "none",
			width: "52px",
			fontSize: "12px",
			color: "var(--dsw-alias-label-secondary, #5c5c5c)"
		};

		const settingsHintStyle = {
			fontSize: "11px",
			lineHeight: "17px",
			color: "var(--dsw-alias-label-caption, #9a9a9a)"
		};

		/**
		 * Occupant of both workspace directory-flow holes: a dated-workspace
		 * dialog with the inherited folder chooser and a cancel arm.
		 * @param {object} props - owner conversation plus the injected faces.
		 * @returns {unknown} the modal element, or null while closed.
		 */
		function DateWorkspaceFlow(props) {
			const open = props.open === true;
			const ownerBusy = props.busy === true;
			const [date, setDate] = react.useState(todayISO);
			const [base, setBase] = react.useState(readBase);
			const [working, setWorking] = react.useState(false);
			const [failure, setFailure] = react.useState(null);
			const submitted = react.useRef(false);
			react.useEffect(() => {
				submitted.current = false;
				if (!open) return;
				setFailure(null);
				setWorking(false);
				setDate(todayISO());
				setBase(readBase());
			}, [open]);
			if (!open) return null;
			const text = texts();
			const normalized = normalizeBase(base);
			const preview = normalized === "" ? "" : joinPath(normalized, date);
			const disabled = working || ownerBusy || submitted.current;
			const close = () => {
				if (disabled) return;
				props.onCancel();
			};
			const create = async () => {
				if (disabled) return;
				submitted.current = true;
				setWorking(true);
				setFailure(null);
				try {
					if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(text.baseRequired);
					if (normalized === "" || splitPath(normalized) === null) throw new Error(text.baseRequired);
					await props.ensure(preview);
					rememberBase(normalized);
					props.onPicked(preview);
				} catch (error) {
					submitted.current = false;
					setWorking(false);
					setFailure(describe(error));
				}
			};
			const browse = async () => {
				if (disabled) return;
				setFailure(null);
				setWorking(true);
				try {
					const picked = await props.pick();
					if (picked === null || picked === void 0) {
						setWorking(false);
						return;
					}
					submitted.current = true;
					props.onPicked(picked);
				} catch (error) {
					setWorking(false);
					setFailure(describe(error));
				}
			};
			const onKeyDown = (event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
				close();
			};
			const quick = (delta) => react.createElement("button", {
				type: "button",
				style: buttonStyle,
				disabled,
				onClick: () => setDate(addDays(todayISO(), delta))
			}, delta === 0 ? text.today : text.tomorrow);
			return react_dom.createPortal(react.createElement("div", {
				style: overlayStyle,
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) close();
				}
			}, react.createElement("div", {
				role: "dialog",
				"aria-modal": "true",
				"aria-label": text.title,
				tabIndex: -1,
				style: panelStyle,
				onKeyDown
			}, react.createElement("div", { style: titleStyle }, text.title), react.createElement("div", { style: subtitleStyle }, text.subtitle), react.createElement("div", { style: rowStyle }, react.createElement("span", { style: labelStyle }, text.date), react.createElement("input", {
				type: "date",
				value: date,
				style: inputStyle,
				disabled,
				onChange: (event) => setDate(event.target.value)
			}), quick(0), quick(1)), react.createElement("div", { style: rowStyle }, react.createElement("span", { style: labelStyle }, text.base), react.createElement("input", {
				type: "text",
				value: base,
				spellCheck: false,
				style: inputStyle,
				disabled,
				onChange: (event) => setBase(event.target.value)
			}), react.createElement("button", {
				type: "button",
				style: buttonStyle,
				disabled,
				title: configuredBase(),
				onClick: () => {
					clearBase();
					setBase(configuredBase());
				}
			}, text.reset)), react.createElement("div", { style: previewStyle }, `${text.preview}: ${preview === "" ? "—" : preview}`), failure === null ? null : react.createElement("div", { style: errorStyle }, failure), react.createElement("div", { style: footerStyle }, react.createElement("span", { style: hintStyle }, `${weekday(date)} · ${text.hint}`), react.createElement("button", {
				type: "button",
				style: buttonStyle,
				disabled,
				onClick: browse
			}, text.browse), react.createElement("button", {
				type: "button",
				style: buttonStyle,
				disabled,
				onClick: close
			}, text.cancel), react.createElement("button", {
				type: "button",
				style: primaryStyle,
				disabled,
				onClick: create
			}, working || ownerBusy ? text.creating : text.create)))), document.body);
		}

		/**
		 * The bundle's configuration page (Plugins → 日期工作区): edits the volatile
		 * `baseDir` through the settings domain, so the save lands in the profile's
		 * Cordis patch and the Host republishes it to every page.
		 * @param {object} props - slot props plus the injected form handle.
		 * @returns {unknown} the form element.
		 */
		function DateWorkspaceSettings(props) {
			const form = props.form;
			const snapshot = react.useSyncExternalStore((listener) => form.subscribe(listener), () => form.getSnapshot());
			const text = texts();
			const effective = typeof snapshot?.value?.baseDir === "string" ? snapshot.value.baseDir : "";
			const [draft, setDraft] = react.useState(effective);
			const [phase, setPhase] = react.useState("idle");
			const [failure, setFailure] = react.useState(null);
			react.useEffect(() => {
				setDraft(effective);
				setPhase("idle");
				setFailure(null);
			}, [effective]);
			const writable = snapshot?.writable !== false;
			const busy = phase === "saving";
			if (snapshot?.status !== "ready") return react.createElement("div", { style: settingsHintStyle }, text.settingsLoading);
			const save = async () => {
				const value = normalizeBase(draft);
				if (value === "" || splitPath(value) === null) {
					setPhase("error");
					setFailure(text.baseRequired);
					return;
				}
				setPhase("saving");
				setFailure(null);
				try {
					if (!await form.set("baseDir", value)) throw new Error(text.settingsFailed);
					clearBase();
					globalThis[GLOBAL_KEY] = { baseDir: value };
					setPhase("saved");
				} catch (error) {
					setPhase("error");
					setFailure(describe(error));
				}
			};
			const restore = async () => {
				setPhase("saving");
				setFailure(null);
				try {
					if (!await form.unset("baseDir")) throw new Error(text.settingsFailed);
					clearBase();
					setPhase("saved");
				} catch (error) {
					setPhase("error");
					setFailure(describe(error));
				}
			};
			return react.createElement("div", { style: settingsCardStyle }, react.createElement("div", { style: settingsRowStyle }, react.createElement("span", { style: settingsLabelStyle }, text.base), react.createElement("input", {
				type: "text",
				value: draft,
				spellCheck: false,
				disabled: !writable || busy,
				style: {
					...inputStyle,
					flex: "1 1 260px"
				},
				onChange: (event) => setDraft(event.target.value)
			}), react.createElement("button", {
				type: "button",
				style: primaryStyle,
				disabled: !writable || busy,
				onClick: save
			}, busy ? text.settingsSaving : text.settingsSave), react.createElement("button", {
				type: "button",
				style: buttonStyle,
				disabled: !writable || busy,
				onClick: restore
			}, text.settingsReset)), react.createElement("div", { style: settingsHintStyle }, `${text.settingsEffective}: ${effective === "" ? "—" : effective}`), react.createElement("div", { style: settingsHintStyle }, text.settingsHint), phase === "saved" ? react.createElement("div", { style: settingsHintStyle }, text.settingsSaved) : null, failure === null ? null : react.createElement("div", { style: errorStyle }, failure));
		}

		//#endregion
		//#region lib/client/index.js

		/** Services this browser half reads. */
		const inject = ["slots", "uiWorkspace"];

		/**
		 * Register the dated-workspace dialog into both workspace directory-flow
		 * holes, then — while the settings domain is composed — its configuration
		 * page and the live base-directory mirror.
		 * Priority -1 shadows the shipped occupant (lowest priority renders), so
		 * removing this plugin restores the original OS chooser.
		 * @param {object} ctx - the client root context.
		 * @returns {void}
		 */
		function apply(ctx) {
			const api = ctx.uiWorkspace;
			const injected = () => ({
				pick: () => api.pickDirectory(),
				ensure: (path) => ensureDirectory(path)
			});
			ctx.slots.inject("conversation.hero.workspace.directoryFlow", () => ctx.slots.inject("sidebar.workspaces.directoryFlow", function* () {
				yield ctx.slots.register({
					name: "conversation.hero.workspace.directoryFlow",
					priority: -1,
					inject: injected
				}, DateWorkspaceFlow);
				yield ctx.slots.register({
					name: "sidebar.workspaces.directoryFlow",
					priority: -1,
					inject: injected
				}, DateWorkspaceFlow);
			}));
			ctx.inject(["configForms"], (settings) => {
				const form = settings.configForms.get("date-workspace");
				settings.effect(() => {
					const sync = () => {
						const base = form.getSnapshot()?.value?.baseDir;
						if (typeof base !== "string" || base.trim() === "") return;
						globalThis[GLOBAL_KEY] = { baseDir: base.trim() };
					};
					const off = form.subscribe(sync);
					sync();
					return off;
				}, "date-workspace: settings mirror");
				settings.slots.inject("plugins.bundle.config", () => settings.slots.register({
					name: "plugins.bundle.config",
					key: "dsh-date-workspace",
					inject: () => ({ form })
				}, DateWorkspaceSettings));
			});
		}

		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
