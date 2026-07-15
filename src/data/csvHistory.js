export const CSV_HISTORY_STORAGE_KEY = "clcCsvHistory";
export const CSV_HISTORY_SCHEMA_VERSION = 2;

/**
 * Records a generated CSV through the extension service worker. The worker
 * serializes writes so two TherapyNotes windows cannot overwrite each other.
 * @param {object} record
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export function recordCsvGenerated(record) {
	return sendMessage({ type: "CLC_RECORD_CSV_GENERATED", record });
}

/** @returns {Promise<{version: number, exports: object[]}>} */
export async function getCsvHistory() {
	const response = await sendMessage({ type: "CLC_GET_CSV_HISTORY" });
	if (!response.ok) throw new Error(response.error || "Unable to read CSV history.");
	return response.history;
}


/**
 * @param {Record<string, unknown>} message
 * @returns {Promise<any>}
 */
function sendMessage(message) {
	return new Promise(resolve => {
		const runtime = (/** @type {any} */ (globalThis)).chrome?.runtime;
		if (!runtime?.sendMessage) {
			resolve({ ok: false, error: "Extension storage is unavailable." });
			return;
		}
		runtime.sendMessage(message, (/** @type {any} */ response) => {
			const error = runtime.lastError;
			resolve(error ? { ok: false, error: error.message } : (response ?? { ok: false }));
		});
	});
}
