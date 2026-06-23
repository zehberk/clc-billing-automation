const LOG_PREFIX = "[CLC][Background]";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
