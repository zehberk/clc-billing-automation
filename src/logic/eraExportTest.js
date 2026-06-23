import { normalizeHref } from "./hrefUtils.js";

const STORAGE_KEY = "clc-era-export-test-state-v2";
const LOG_PREFIX = "[CLC][ERA Export Test]";
const SUMMARY_TIMEOUT_MS = 45000;

/**
 * @typedef {{ eraNumber: string, received: string, payer: string, href: string }} EraEntry
 * @typedef {{ eraNumber?: string, invoiceItem: string, totalAllocation: string, invoiceRate: string, taxRate: string, checkMemo: string }} SummaryRow
 * @typedef {{
 *  mode: "single-era-test",
 *  runId: string,
 *  status: "opening" | "era-done" | "era-skip" | "error",
 *  createdAt?: string,
 *  completedAt?: string,
 *  originHref: string,
 *  targetHref: string,
 *  pendingEras: EraEntry[],
 *  currentIndex: number,
 *  results: SummaryRow[],
 *  rows?: SummaryRow[],
 *  era: EraEntry,
 *  eraRows?: SummaryRow[],
 *  skipReason?: string,
 *  error?: string
 * }} ExportState
 * @typedef {{ type: "table", table: HTMLTableElement } | { type: "skip", reason: string }} WaitResult
 */

export function initEraExportTest() {
	log("init", { href: window.location.href });

	if (isEraListPage()) {
		log("Detected ERA list page");
		injectTestButton();
		window.addEventListener("storage", onStorageChanged);
		return;
	}

	if (isPaymentDetailPage()) {
		log("Detected payment detail page");
		runPaymentPageCollector();
		return;
	}

	log("Page type not used by export test");
}

function isEraListPage() {
	return !!document.querySelector("#DivErasResults");
}

function isPaymentDetailPage() {
	if (document.querySelector("#BillingTransactionsTableList")) return true;
	return window.location.href.includes("DisplayContext=PaymentStaticView");
}

function injectTestButton() {
	if (document.getElementById("clc-era-export-test-btn")) return;
	if (!document.body) return;

	const button = document.createElement("button");
	button.id = "clc-era-export-test-btn";
	button.type = "button";
	button.textContent = "Test All ERAs (One by One)";
	Object.assign(button.style, {
		position: "fixed",
		right: "16px",
		bottom: "16px",
		zIndex: "99999",
		padding: "10px 12px",
		border: "1px solid #1b6aa8",
		background: "#1f84d1",
		color: "#fff",
		borderRadius: "6px",
		cursor: "pointer",
		fontWeight: "600"
	});

	button.addEventListener("click", startSingleEraTest);
	document.body.appendChild(button);
}

function startSingleEraTest() {
	log("Button clicked. Starting ERA export test for all rows.");

	const links = Array.from(document.querySelectorAll("a[href*='DisplayContext=PaymentStaticView']"))
		.filter(link => link instanceof HTMLAnchorElement);
	if (links.length === 0) {
		log("No View Payment links found");
		showPopup("No View Payment links found on this page.");
		return;
	}

	/** @type {EraEntry[]} */
	const eras = links
		.map(link => {
			const row = link.closest("tr");
			const cells = row?.querySelectorAll("td");
			const eraNumber = cells?.[0]?.textContent?.trim() ?? "";
			const received = cells?.[1]?.textContent?.trim() ?? "";
			const payer = cells?.[2]?.textContent?.trim() ?? "";
			const href = link.getAttribute("href") ?? "";
			if (!href) return null;
			return { eraNumber, received, payer, href };
		})
		.filter((era) => era !== null);

	if (eras.length === 0) {
		log("View Payment links are missing href");
		showPopup("View Payment links are missing href.");
		return;
	}

	const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const firstEra = eras[0];
	if (!firstEra) {
		showPopup("No valid ERA rows found.");
		return;
	}
	/** @type {ExportState} */
	const state = {
		mode: "single-era-test",
		runId,
		status: "opening",
		createdAt: new Date().toISOString(),
		originHref: normalizeHref(window.location.href),
		pendingEras: eras,
		currentIndex: 0,
		results: [],
		targetHref: normalizeHref(firstEra.href),
		era: firstEra
	};

	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	log("Saved state and requesting background tab open", {
		runId,
		eraCount: eras.length,
		eraNumber: firstEra.eraNumber,
		targetHref: state.targetHref
	});
	openEraTab(firstEra.href);
}

function runPaymentPageCollector() {
	/** @type {ExportState | null} */
	const state = readState();
	if (!isActiveOpeningState(state)) {
		log("No active opening state on payment page");
		return;
	}
	const activeState = /** @type {ExportState} */ (state);

	const currentHref = normalizeHref(window.location.href);
	if (activeState.targetHref !== currentHref) {
		log("Current payment page is not target page", {
			expected: activeState.targetHref,
			actual: currentHref
		});
		return;
	}

	log("Matched target payment page. Waiting for generated summary table.", {
		runId: activeState.runId,
		eraNumber: activeState.era?.eraNumber
	});

	waitForSummaryTable()
		.then(result => {
			if (result.type === "skip") {
				const skipState = {
					...activeState,
					status: "era-skip",
					completedAt: new Date().toISOString(),
					skipReason: result.reason
				};
				localStorage.setItem(STORAGE_KEY, JSON.stringify(skipState));
				log("Saved skip state and closing tab", { runId: activeState.runId, reason: result.reason });
				window.close();
				return;
			}

			const table = result.table;
			const rows = extractSummaryRows(table);
			log("Summary table ready. Extracted rows.", {
				runId: activeState.runId,
				rowCount: rows.length
			});

			const doneState = {
				...activeState,
				status: "era-done",
				completedAt: new Date().toISOString(),
				eraRows: rows
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(doneState));
			log("Saved done state and closing tab", { runId: activeState.runId });
			window.close();
		})
		.catch(err => {
			const message = err instanceof Error ? err.message : String(err);
			log("Failed waiting for summary table", { runId: activeState.runId, message });
			const skipState = {
				...activeState,
				status: "era-skip",
				skipReason: message,
				completedAt: new Date().toISOString()
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(skipState));
			window.close();
		});
}

function waitForSummaryTable() {
	/** @returns {Promise<WaitResult>} */
	return new Promise((resolve, reject) => {
		const getSkipReason = () => {
			const skipTable = document.querySelector(".qb-warning-table");
			if (skipTable instanceof HTMLElement) {
				const text = skipTable.textContent?.replace(/\s+/g, " ").trim() ?? "";
				if (text) return text;
				return "Do Not Enter Payment Into QuickBooks warning detected.";
			}

			const warningNodes = Array.from(document.querySelectorAll("div, table, th, td, span"));
			for (const node of warningNodes) {
				const text = node.textContent?.replace(/\s+/g, " ").trim();
				if (!text) continue;
				if (text.includes("⚠️ Payment Warning:")) return text;
			}

			return "";
		};

		const existing = document.querySelector("#QuickBooksSummaryTable");
		if (existing instanceof HTMLTableElement) {
			log("Summary table already present");
			const warning = getSkipReason();
			if (warning) {
				resolve({ type: "skip", reason: warning });
				return;
			}
			resolve({ type: "table", table: existing });
			return;
		}

		const initialWarning = getSkipReason();
		if (initialWarning) {
			log("Skip warning already present");
			resolve({ type: "skip", reason: initialWarning });
			return;
		}

		log("Waiting for #QuickBooksSummaryTable");
		const timeout = window.setTimeout(() => {
			observer.disconnect();
			reject(new Error(`Timed out after ${SUMMARY_TIMEOUT_MS}ms waiting for #QuickBooksSummaryTable`));
		}, SUMMARY_TIMEOUT_MS);

		const observer = new MutationObserver(() => {
			const warning = getSkipReason();
			if (warning) {
				window.clearTimeout(timeout);
				observer.disconnect();
				log("Skip warning detected");
				resolve({ type: "skip", reason: warning });
				return;
			}

			const table = document.querySelector("#QuickBooksSummaryTable");
			if (table instanceof HTMLTableElement) {
				window.clearTimeout(timeout);
				observer.disconnect();
				log("Summary table detected");
				resolve({ type: "table", table });
			}
		});

		if (!document.body) {
			reject(new Error("document.body is not ready"));
			return;
		}

		observer.observe(document.body, { childList: true, subtree: true });
	});
}

/**
 * @param {HTMLTableElement} table
 * @returns {SummaryRow[]}
 */
function extractSummaryRows(table) {
	const rows = Array.from(table.querySelectorAll("tbody tr"));
	return rows.map(row => {
		const cells = row.querySelectorAll("td");
		return {
			invoiceItem: cells?.[0]?.textContent?.trim() ?? "",
			totalAllocation: cells?.[1]?.textContent?.trim() ?? "",
			taxRate: cells?.[2]?.textContent?.trim() ?? "",
			invoiceRate: cells?.[3]?.textContent?.trim() ?? "",
			checkMemo: cells?.[4]?.textContent?.trim() ?? ""
		};
	});
}

/**
 * @param {StorageEvent} event
 */
function onStorageChanged(event) {
	if (event.key !== STORAGE_KEY) return;

	const state = readState();
	if (!state || state.mode !== "single-era-test") return;

	if (state.status === "era-done") {
		const eraRows = state.eraRows ?? [];
		const eraNumber = state.era?.eraNumber ?? "";
		const appendedRows = eraRows.map(row => ({ ...row, eraNumber }));
		advanceToNextEra(state, appendedRows);
		return;
	}

	if (state.status === "era-skip") {
		const eraNumber = state.era?.eraNumber ?? "";
		const reason = state.skipReason || "Skipped due to warning/error.";
		const noteRow = {
			eraNumber,
			invoiceItem: "[SKIPPED]",
			totalAllocation: "",
			invoiceRate: "",
			taxRate: "",
			checkMemo: reason
		};
		advanceToNextEra(state, [noteRow]);
		return;
	}

	if (state.status === "error") {
		log("Received error state in origin tab", { runId: state.runId, error: state.error });
		showPopup(`ERA test failed: ${state.error}`);
		clearState();
	}
}

/**
 * @param {ExportState} state
 */
function showResultsPopup(state) {
	const rows = state.results ?? state.rows ?? [];
	if (rows.length === 0) {
		showPopup("No rows were found in QuickBooks Payment Entry.");
		return;
	}

	showResultsTablePopup(state);
}

/**
 * @param {string} text
 */
function showPopup(text) {
	const existing = document.getElementById("clc-era-export-test-popup");
	if (existing) existing.remove();

	const wrap = document.createElement("div");
	wrap.id = "clc-era-export-test-popup";
	Object.assign(wrap.style, {
		position: "fixed",
		right: "16px",
		bottom: "64px",
		width: "460px",
		maxHeight: "70vh",
		overflow: "auto",
		zIndex: "100000",
		background: "#fff",
		color: "#111",
		border: "1px solid #888",
		borderRadius: "8px",
		padding: "12px",
		boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
		whiteSpace: "pre-wrap",
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
		fontSize: "12px",
		lineHeight: "1.5"
	});

	const close = document.createElement("button");
	close.type = "button";
	close.textContent = "Close";
	Object.assign(close.style, {
		float: "right",
		marginBottom: "8px",
		cursor: "pointer"
	});
	close.addEventListener("click", () => wrap.remove());

	const body = document.createElement("div");
	body.textContent = text;

	wrap.appendChild(close);
	wrap.appendChild(body);
	document.body.appendChild(wrap);
}

/**
 * @param {ExportState} state
 */
function showResultsTablePopup(state) {
	const existing = document.getElementById("clc-era-export-test-popup");
	if (existing) existing.remove();

	const wrap = document.createElement("div");
	wrap.id = "clc-era-export-test-popup";
	Object.assign(wrap.style, {
		position: "fixed",
		right: "16px",
		bottom: "64px",
		width: "760px",
		maxHeight: "70vh",
		overflow: "auto",
		zIndex: "100000",
		background: "#fff",
		color: "#111",
		border: "1px solid #888",
		borderRadius: "8px",
		padding: "12px",
		boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
		fontFamily: "ui-sans-serif, system-ui, sans-serif",
		fontSize: "12px",
		lineHeight: "1.4"
	});

	const close = document.createElement("button");
	close.type = "button";
	close.textContent = "Close";
	Object.assign(close.style, {
		float: "right",
		marginBottom: "8px",
		cursor: "pointer"
	});
	close.addEventListener("click", () => wrap.remove());

	const table = document.createElement("table");
	Object.assign(table.style, {
		width: "100%",
		borderCollapse: "collapse"
	});

	const thead = document.createElement("thead");
	const headRow = document.createElement("tr");
	["ERA #", "Invoice Item", "Total Allocation", "Invoice Rate", "Tax Rate", "Check Memo"].forEach(label => {
		const th = document.createElement("th");
		th.textContent = label;
		Object.assign(th.style, {
			border: "1px solid #ccc",
			padding: "6px",
			textAlign: "left",
			background: "#f5f5f5"
		});
		headRow.appendChild(th);
	});
	thead.appendChild(headRow);

	const tbody = document.createElement("tbody");
	for (const row of (state.results ?? state.rows ?? [])) {
		const tr = document.createElement("tr");
		const values = [
			row.eraNumber ?? state.era?.eraNumber ?? "",
			row.invoiceItem,
			row.totalAllocation,
			row.invoiceRate,
			row.taxRate || "(none)",
			row.checkMemo
		];

		for (const value of values) {
			const td = document.createElement("td");
			td.textContent = value ?? "";
			Object.assign(td.style, {
				border: "1px solid #ddd",
				padding: "6px",
				verticalAlign: "top"
			});
			tr.appendChild(td);
		}

		tbody.appendChild(tr);
	}

	table.appendChild(thead);
	table.appendChild(tbody);

	wrap.appendChild(close);
	wrap.appendChild(table);
	document.body.appendChild(wrap);
}

/**
 * @param {string} href
 */
function openEraTab(href) {
	const runtime = /** @type {{ sendMessage?: Function, lastError?: { message?: string } } | undefined} */ (
		/** @type {any} */ (globalThis).chrome?.runtime
	);
	if (!runtime?.sendMessage) {
		log("chrome.runtime.sendMessage unavailable, cannot open inactive tab");
		setStateSkip("Extension messaging unavailable.");
		return;
	}

	runtime.sendMessage(
		{ type: "CLC_OPEN_BACKGROUND_TAB", href, active: true },
		(/** @type {{ ok?: boolean, error?: string, tabId?: number } | undefined} */ response) => {
			const runtimeError = runtime.lastError;
			if (runtimeError) {
				log("Background tab open failed", { message: runtimeError.message });
				setStateSkip(runtimeError.message || "Failed to open background tab.");
				return;
			}

			if (!response?.ok) {
				log("Background tab open returned error", response);
				const msg = response?.error || "Failed to open background tab.";
				setStateSkip(msg);
				return;
			}

			log("Opened background tab", { tabId: response.tabId });
		}
	);
}

/**
 * @param {ExportState | null} state
 * @returns {boolean}
 */
function isActiveOpeningState(state) {
	return !!state && state.mode === "single-era-test" && state.status === "opening" && !!state.targetHref;
}

/**
 * @param {string} message
 */
function setStateError(message) {
	const state = readState();
	if (!state) return;
	state.status = "error";
	state.error = message;
	state.completedAt = new Date().toISOString();
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * @param {string} message
 */
function setStateSkip(message) {
	const state = readState();
	if (!state) return;
	state.status = "era-skip";
	state.skipReason = message;
	state.completedAt = new Date().toISOString();
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * @param {ExportState} state
 * @param {SummaryRow[]} newRows
 */
function advanceToNextEra(state, newRows) {
	const mergedRows = [...(state.results ?? []), ...newRows];
	const nextIndex = (state.currentIndex ?? 0) + 1;
	const pendingEras = state.pendingEras ?? [];

	if (nextIndex >= pendingEras.length) {
		log("Received final done state in origin tab", { runId: state.runId, rowCount: mergedRows.length });
		showResultsPopup({ ...state, results: mergedRows });
		clearState();
		return;
	}

	const nextEra = pendingEras[nextIndex];
	const nextState = {
		...state,
		status: "opening",
		currentIndex: nextIndex,
		results: mergedRows,
		targetHref: normalizeHref(nextEra.href),
		era: nextEra,
		eraRows: undefined,
		skipReason: undefined,
		error: undefined
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
	log("Opening next ERA", { runId: state.runId, nextIndex, eraNumber: nextEra.eraNumber });
	openEraTab(nextEra.href);
}

function clearState() {
	localStorage.removeItem(STORAGE_KEY);
}

function readState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? /** @type {ExportState} */ (JSON.parse(raw)) : null;
	} catch {
		log("Failed to parse state");
		return null;
	}
}

/**
 * @param {string} message
 * @param {unknown} [data]
 */
function log(message, data) {
	if (data !== undefined) {
		console.log(`${LOG_PREFIX} ${message}`, data);
		return;
	}
	console.log(`${LOG_PREFIX} ${message}`);
}
