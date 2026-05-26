import { ALL_READY } from "../data/loaders.js";
import { normalizeHref, setEraPayerByHref } from "../logic/hrefUtils.js";

let dataReady = false;
ALL_READY.then(() => { dataReady = true; });

/**
 * @param {string} selector
 * @param {(el: Element) => void} callback
 */
export function waitForElement(selector, callback) {
	const observer = new MutationObserver(() => {
		const el = document.querySelector(selector);
		if (el) {
			observer.disconnect();
			callback(el);
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
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
