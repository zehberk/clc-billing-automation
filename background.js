const LOG_PREFIX = "[CLC][Background]";
const CSV_HISTORY_STORAGE_KEY = "clcCsvHistory";
const CSV_HISTORY_SCHEMA_VERSION = 2;
let csvHistoryWrite = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "CLC_GET_CSV_HISTORY") {
		chrome.storage.local.get(CSV_HISTORY_STORAGE_KEY, result => {
			const history = normalizeCsvHistory(result[CSV_HISTORY_STORAGE_KEY]);
			sendResponse({ ok: true, history });
		});
		return true;
	}

	if (message?.type === "CLC_RECORD_CSV_GENERATED") {
		csvHistoryWrite = csvHistoryWrite.then(() => appendCsvHistory(message.record));
		csvHistoryWrite.then(() => sendResponse({ ok: true })).catch(error => {
			console.log(`${LOG_PREFIX} CSV history write failed`, error);
			sendResponse({ ok: false, error: error?.message || String(error) });
		});
		return true;
	}

	if (message?.type !== "CLC_OPEN_BACKGROUND_TAB") return;

	const href = message.href;
	const active = !!message.active;
	if (!href || typeof href !== "string") {
		sendResponse({ ok: false, error: "Missing or invalid href." });
		return;
	}

	const baseUrl = sender?.url || "https://www.therapynotes.com/";
	let targetUrl;
	try {
		targetUrl = new URL(href, baseUrl).toString();
	} catch {
		sendResponse({ ok: false, error: "Failed to resolve target URL." });
		return;
	}

	chrome.tabs.create({ url: targetUrl, active }, (tab) => {
		if (chrome.runtime.lastError) {
			console.log(`${LOG_PREFIX} tab create failed`, chrome.runtime.lastError.message);
			sendResponse({ ok: false, error: chrome.runtime.lastError.message });
			return;
		}

		console.log(`${LOG_PREFIX} opened tab`, { tabId: tab?.id, url: targetUrl, active });
		sendResponse({ ok: true, tabId: tab?.id ?? null });
	});

	return true;
});

async function appendCsvHistory(record) {
	if (!record || typeof record !== "object" || !Array.isArray(record.invoices) || !Array.isArray(record.payments)) {
		throw new Error("Invalid CSV history record.");
	}
	const stored = await chrome.storage.local.get(CSV_HISTORY_STORAGE_KEY);
	const history = normalizeCsvHistory(stored[CSV_HISTORY_STORAGE_KEY]);
	const newInvoiceNumbers = new Set(record.invoices.map(invoice => invoice.invoiceNumber).filter(Boolean));
	history.exports = history.exports.filter(existing => {
		if (existing.fileName === record.fileName) return false;
		if (existing.startingInvoiceNumber === record.startingInvoiceNumber) return false;
		return !(existing.invoices ?? []).some(invoice => newInvoiceNumbers.has(invoice.invoiceNumber));
	});
	history.exports.push(record);
	await chrome.storage.local.set({ [CSV_HISTORY_STORAGE_KEY]: history });
}

function normalizeCsvHistory(value) {
	if (Array.isArray(value?.exports)) return { version: CSV_HISTORY_SCHEMA_VERSION, exports: value.exports };
	return { version: CSV_HISTORY_SCHEMA_VERSION, exports: [] };
}
