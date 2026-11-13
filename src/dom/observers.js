import { ALL_READY } from "../data/loaders.js";
import { normalizeHref, setEraPayerByHref } from "../logic/hrefUtils.js";

let dataReady = false;
ALL_READY.then(() => { dataReady = true; });

/**
 * @param {string} selector
 * @param {(el: Element) => void} callback
 */
export function waitForElement(selector, callback) {
	const existing = document.querySelector(selector);
	if (existing) {
		callback(existing);
		return;
	}

	const observer = new MutationObserver(() => {
		const el = document.querySelector(selector);
		if (el) {
			observer.disconnect();
			callback(el);
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Wait for the primary element, using the fallback only when the primary does
 * not appear shortly after the fallback is rendered.
 *
 * @param {string} primarySelector
 * @param {string} fallbackSelector
 * @param {(el: Element) => void} callback
 * @param {number} fallbackDelayMs
 */
export function waitForPreferredElement(primarySelector, fallbackSelector, callback, fallbackDelayMs = 1500) {
	/** @type {number | null} */
	let fallbackTimer = null;

	const primary = document.querySelector(primarySelector);
	if (primary) {
		callback(primary);
		return;
	}

	const observer = new MutationObserver(check);

	/** @param {Element} el */
	function finish(el) {
		if (fallbackTimer != null) clearTimeout(fallbackTimer);
		observer.disconnect();
		callback(el);
		if (!el.matches(primarySelector)) watchForLatePrimary();
	}

	// A slow page can render the primary after the fallback was used; run the
	// callback again so it can rebuild from the complete page.
	function watchForLatePrimary() {
		const lateObserver = new MutationObserver(() => {
			const late = document.querySelector(primarySelector);
			if (!late) return;
			lateObserver.disconnect();
			callback(late);
		});
		lateObserver.observe(document.body, { childList: true, subtree: true });
		window.setTimeout(() => lateObserver.disconnect(), 30000);
	}

	function check() {
		const preferred = document.querySelector(primarySelector);
		if (preferred) {
			finish(preferred);
			return;
		}

		const fallback = document.querySelector(fallbackSelector);
		if (!fallback || fallbackTimer != null) return;

		fallbackTimer = window.setTimeout(() => {
			const latestPreferred = document.querySelector(primarySelector);
			const latestFallback = document.querySelector(fallbackSelector);
			const latest = latestPreferred ?? latestFallback;
			if (latest) finish(latest);
			else fallbackTimer = null;
		}, fallbackDelayMs);
	}

	observer.observe(document.body, { childList: true, subtree: true });
	check();
}

export function attachEraClickHandlers() {
	const links = document.querySelectorAll("a[href*='DisplayContext=PaymentStaticView']");
	links.forEach(link => {
		if (!(link instanceof HTMLElement)) return;
		if (link.dataset.qbHandlerAttached) return;
		link.dataset.qbHandlerAttached = "true";

		link.addEventListener("mousedown", () => {
			const row = link.closest("tr");
			const payerDiv = row?.querySelector(".column-payer-name");
			if (!(payerDiv instanceof HTMLElement)) return;
			const payerName = payerDiv?.innerText?.trim();
			const href = link.getAttribute("href");

			if (payerName && href) {
				setEraPayerByHref(normalizeHref(href), payerName);
			}
			// Highlight the ERA row the user clicked
			if (row && href) {
				// localStorage key per row
				const key = "eraClicks-" + normalizeHref(href);

				// Get existing click count or start at 0
				let count = Number(localStorage.getItem(key) || 0);

				// Increase and cap at 3
				count = Math.min(count + 1, 3);

				localStorage.setItem(key, String(count));

				// Remove old classes
				row.classList.remove("qb-era-clicked-1", "qb-era-clicked-2", "qb-era-clicked-3", "qb-era-mismatch");

				// Add new one
				row.classList.add(`qb-era-clicked-${count}`, "qb-era-fade");
			}
		});
	});
}
