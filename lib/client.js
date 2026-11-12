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
				preview: "Will create",
				create: "Create and open",
				browse: "Browse folders…",
				cancel: "Cancel",
				creating: "Creating…",
				opening: "Opening…",
				hint: "An existing folder is adopted as is.",
				baseRequired: "Enter a base directory."
			};
			return {
				title: "新建工作区",
				subtitle: "按日期创建工作区，或浏览其他文件夹。",
				date: "日期",
				today: "今天",
				tomorrow: "明天",
				base: "基目录",
				preview: "将创建",
				create: "创建并打开",
				browse: "浏览文件夹…",
				cancel: "取消",
				creating: "创建中…",
				opening: "打开中…",
				hint: "目录已存在时直接打开，不覆盖内容。",
				baseRequired: "请填写基目录。"
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

		/** @returns {string} the remembered base directory, or the default. */
		function readBase() {
			try {
				const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
				if (typeof stored === "string" && stored.trim() !== "") return stored;
			} catch (_error) {
				/* storage unavailable: fall back to the default */
			}
			return DEFAULT_BASE;
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

		/** @param {unknown} error - a directory failure. @returns {string | undefined} its business code. */
		function errorCode(error) {
			if (typeof error !== "object" || error === null) return void 0;
			const rpc = error.rpcError;
			if (typeof rpc === "object" && rpc !== null && typeof rpc.code === "string") return rpc.code;
			return typeof error.code === "string" ? error.code : void 0;
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

		/**
		 * Create every missing segment of a fully qualified path through the Host
		 * directory primitives; an existing segment is kept.
		 * @param {{ createDirectory: (path: string, name: string) => Promise<unknown> }} api - workspace UI service.
		 * @param {string} fullPath - target directory.
		 * @returns {Promise<void>} resolves once the directory exists.
		 */
		async function ensureDirectory(api, fullPath) {
			const split = splitPath(fullPath);
			if (split === null) throw new Error(`not a fully qualified path: ${fullPath}`);
			let current = split.root;
			const separator = split.root.endsWith("/") ? "/" : "\\";
			for (const segment of split.segments) {
				try {
					await api.createDirectory(current, segment);
				} catch (error) {
					if (errorCode(error) !== "directory-exists") throw error;
				}
				current = `${current}${current.endsWith(separator) ? "" : separator}${segment}`;
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
			})), react.createElement("div", { style: previewStyle }, `${text.preview}: ${preview === "" ? "—" : preview}`), failure === null ? null : react.createElement("div", { style: errorStyle }, failure), react.createElement("div", { style: footerStyle }, react.createElement("span", { style: hintStyle }, `${weekday(date)} · ${text.hint}`), react.createElement("button", {
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

		//#endregion
		//#region lib/client/index.js

		/** Services this browser half reads. */
		const inject = ["slots", "uiWorkspace"];

		/**
		 * Register the dated-workspace dialog into both workspace directory-flow
		 * holes. Priority -1 shadows the shipped occupant (lowest priority
		 * renders), so removing this plugin restores the original OS chooser.
		 * @param {object} ctx - the client root context.
		 * @returns {void}
		 */
		function apply(ctx) {
			const api = ctx.uiWorkspace;
			const injected = () => ({
				pick: () => api.pickDirectory(),
				ensure: (path) => ensureDirectory(api, path)
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
		}

		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
