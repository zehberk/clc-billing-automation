// Entry point (content script)
console.log("[CLC] content script boot", window.location.href);
markContentScriptBoot();

function markContentScriptBoot() {
	if (!document.documentElement) return;
	const frameType = window.top === window ? "top" : "frame";
	document.documentElement.setAttribute("data-clc-content-script", frameType);
}

// ERA highlight style injection
(function addEraHighlightStyles() {
	function inject() {
		if (!document.head) {
			requestAnimationFrame(inject);
			return;
		}
		if (document.getElementById("EraHighlightStyles")) return;

		console.log("Injecting ERA highlight CSS");

		const style = document.createElement("style");
		style.id = "EraHighlightStyles";
		style.textContent = `
			.qb-era-clicked-1 { background-color: #ffe7a6 !important; }
			.qb-era-clicked-2 { background-color: #ffb347 !important; }
			.qb-era-clicked-3 { background-color: #f78f06ff !important; }
			.qb-era-mismatch { background-color: #ff9393ff !important; }
			.qb-era-fade { transition: background-color 0.66s ease; }
		`;
		document.head.appendChild(style);
	}

	inject();
})();

import {
	EXCLUDED_PAYERS,
	taxRatesReady,
	sfTherapistsReady,
	invoiceItemsReady,
	MEDICARE_OVERRIDE_PAYERS,
	setUseMedicareOverride,
	GEHA_OVERRIDE_PAYERS,
	setUseGehaOverride,
	STORAGE_KEYS
} from "./src/data/constants.js";

import "./src/data/loaders.js";
import { injectPaymentSummary, injectSkipWarning } from "./src/dom/injectTables.js";
import { injectSharedStyles } from "./src/dom/styles.js";
import { injectPaymentVerifier } from "./src/dom/verification.js";
import { getEraPayerByHref, normalizeHref } from "./src/logic/hrefUtils.js";
import { getPaymentField } from "./src/logic/paymentFields.js";
import { waitForElement, attachEraClickHandlers } from "./src/dom/observers.js";
import { autoSelectInvoiceCustomer } from "./src/dom/invoiceCustomer.js";
import { initEraExportTest } from "./src/logic/eraExportTest.js";

// startInvoiceAutoSelectWatcher();
initEraExportTest();

function startInvoiceAutoSelectWatcher() {
	let lastHref = "";

	const run = () => {
		const currentHref = window.location.href;
		if (currentHref === lastHref) return;
		lastHref = currentHref;
		autoSelectInvoiceCustomer();
	};

	// Initial run.
	run();

	// Handle client-side route changes.
	const originalPushState = history.pushState;
	history.pushState = function (...args) {
		originalPushState.apply(this, args);
		run();
	};

	const originalReplaceState = history.replaceState;
	history.replaceState = function (...args) {
		originalReplaceState.apply(this, args);
		run();
	};

	window.addEventListener("popstate", run);

	// Fallback: many QBO screens render after route update.
	const startDomObserver = () => {
		if (!document.body) {
			requestAnimationFrame(startDomObserver);
			return;
		}
		const observer = new MutationObserver(run);
		observer.observe(document.body, { childList: true, subtree: true });
	};
	startDomObserver();
}

waitForElement("#BillingTransactionsTableList", () => {
	injectSharedStyles();
	// console.log("Test")
	const currentHref = normalizeHref(window.location.href);
	const eraPayer = getEraPayerByHref(currentHref);
	// console.log("ERA Payer: " + eraPayer);
	const paymentAmountStr = getPaymentField("Payment Amount:");
	const paymentAmount = paymentAmountStr ? parseFloat(paymentAmountStr.replace(/[^0-9.]/g, "")) : null;

	if (EXCLUDED_PAYERS.has(eraPayer)) {
		injectSkipWarning(`${eraPayer} is a check-only payer`);
		return;
	}

	if (paymentAmount === 0) {
		injectSkipWarning("the payment amount is $0");
		return;
	}

	if (MEDICARE_OVERRIDE_PAYERS.some(p => eraPayer?.includes(p))) {
		setUseMedicareOverride(true);
	}

	if (GEHA_OVERRIDE_PAYERS.some(p => eraPayer?.includes(p))) {		
		console.log("GEHA Payer found");
		setUseGehaOverride(true);
	}
	Promise.all([taxRatesReady, sfTherapistsReady, invoiceItemsReady]).then(() => {
		injectPaymentSummary();
	});
});

// Attach listeners to ERA table
const targetNode = document.getElementById("DivErasResults");
if (targetNode) {
	const observer = new MutationObserver(attachEraClickHandlers);
	observer.observe(targetNode, { childList: true, subtree: true });
	attachEraClickHandlers();


	const emptyObserver = new MutationObserver(mutations => {
		for (const m of mutations) {
			if (m.type === 'childList') {
				if (targetNode.childNodes.length === 0) {
					injectPaymentVerifier(targetNode);
				}
			}
		}
	});

	emptyObserver.observe(targetNode, {
		childList: true
	});


	// Clear cached invoice item data when ERA list page is closed/refreshed
	window.addEventListener("beforeunload", () => {
		try {
			localStorage.removeItem(STORAGE_KEYS.INVOICE_ITEMS);
			localStorage.removeItem(STORAGE_KEYS.SF_THERAPISTS);
			localStorage.removeItem(STORAGE_KEYS.TAX_RATES);
			// Delete all the click counts
			Object.keys(localStorage)
				.filter(key => key.startsWith("eraClicks"))
				.forEach(key => localStorage.removeItem(key));
		} catch (err) {
			console.warn("Error clearing cache on unload:", err);
		}
	});

	injectPaymentVerifier(targetNode);
}
