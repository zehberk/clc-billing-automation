import { getCsvHistory } from "../data/csvHistory.js";

const RECEIVE_PAYMENT_PATH = "/app/recvpayment";
const LOG_PREFIX = "[CLC][Receive Payment]";
const TARGET_TIMEOUT_MS = 30000;
const OPTION_TIMEOUT_MS = 5000;

export function initReceivePaymentAutomation() {
	if (window.top !== window || window.location.hostname !== "qbo.intuit.com") return;

	let lastHandledHref = "";
	const checkRoute = () => {
		if (window.location.pathname !== RECEIVE_PAYMENT_PATH) return;
		if (window.location.href === lastHandledHref) return;
		lastHandledHref = window.location.href;
		runReceivePaymentAutomation()
			.then(result => console.log(`${LOG_PREFIX} completed`, result))
			.catch(error => console.warn(`${LOG_PREFIX} stopped`, error));
	};

	checkRoute();
	window.addEventListener("popstate", checkRoute);
	window.addEventListener("hashchange", checkRoute);
	window.setInterval(checkRoute, 500);
}

export async function runReceivePaymentAutomation() {
	await waitForAutomationTargets();
	const history = await getCsvHistory();
	const invoiceRows = getInvoiceRows();
	const displayedInvoiceNumbers = new Set(invoiceRows.map(entry => entry.invoiceNumber));
	const contextualInvoiceNumber = getContextualInvoiceNumber(invoiceRows);
	const amountReceived = readMoneyInput(findInputByLabel("Amount received"));
	const payment = findPayment(history.exports, {
		displayedInvoiceNumbers,
		contextualInvoiceNumber,
		amountReceived
	});

	if (payment.requiresReview) {
		throw new Error(`Payment ${payment.paymentReference || "without a reference"} requires mapping review.`);
	}

	const targetInvoiceNumbers = payment.invoiceSelections.map(selection => selection.invoiceNumber);
	const invoiceSelection = await selectExactInvoices(targetInvoiceNumbers);
	const referenceInput = findInputByLabel("Reference no.");
	if (!referenceInput) throw new Error("Reference number field was not found.");
	const referenceFilled = setNativeInputValue(referenceInput, payment.paymentMemo);
	const paymentMethod = await selectPaymentMethod(payment.paymentType);

	return {
		paymentReference: payment.paymentReference,
		paymentMemo: payment.paymentMemo,
		referenceFilled,
		...paymentMethod,
		...invoiceSelection
	};
}

// Kept for the existing benchmark module while it is still in the repository.
export const runReceivePaymentExperiment = runReceivePaymentAutomation;

function automationTargetsReady() {
	return !!findInputByLabel("Reference no.") && !!findPaymentMethodControl() && getInvoiceRows().length > 0;
}

/** @returns {Promise<void>} */
function waitForAutomationTargets() {
	return new Promise((resolve, reject) => {
		if (automationTargetsReady()) {
			resolve();
			return;
		}
		const observer = new MutationObserver(() => {
			if (!automationTargetsReady()) return;
			observer.disconnect();
			clearTimeout(timeout);
			resolve();
		});
		observer.observe(document.body, { childList: true, subtree: true, characterData: true });
		const timeout = window.setTimeout(() => {
			observer.disconnect();
			reject(new Error(`QBO payment controls were not ready after ${TARGET_TIMEOUT_MS / 1000}s.`));
		}, TARGET_TIMEOUT_MS);
	});
}

/**
 * @param {object[]} exports
 * @param {{ displayedInvoiceNumbers: Set<string>, contextualInvoiceNumber: string, amountReceived: string }} context
 */
function findPayment(exports, context) {
	const payments = exports.slice().reverse().flatMap(record => (record.payments ?? []).slice().reverse());
	const available = payments.filter(payment =>
		payment.invoiceSelections?.length > 0 &&
		payment.invoiceSelections.every(selection => context.displayedInvoiceNumbers.has(selection.invoiceNumber))
	);
	if (context.contextualInvoiceNumber) {
		const contextMatches = available.filter(payment =>
			payment.invoiceSelections.some(selection => selection.invoiceNumber === context.contextualInvoiceNumber)
		);
		if (contextMatches.length === 1) return contextMatches[0];
		if (contextMatches.length > 1) throw new Error(`More than one saved payment contains invoice ${context.contextualInvoiceNumber}.`);
	}

	if (context.amountReceived) {
		const amountMatches = available.filter(payment => payment.paymentAmount === context.amountReceived);
		if (amountMatches.length === 1) return amountMatches[0];
		if (amountMatches.length > 1) throw new Error(`More than one saved payment matches amount ${context.amountReceived}.`);
	}

	throw new Error("Could not uniquely match this QBO screen to a saved TherapyNotes payment.");
}

/**
 * Uses QBO's route transaction ID to identify the invoice that opened this
 * screen. Checkbox state is deliberately ignored because QBO may prefill it
 * incorrectly.
 * @param {{ invoiceLink: HTMLAnchorElement, invoiceNumber: string }[]} invoiceRows
 */
function getContextualInvoiceNumber(invoiceRows) {
	const routeParams = new URL(window.location.href).searchParams;
	const transactionId = routeParams.get("srcTxnId") ?? routeParams.get("txnId");
	if (!transactionId) return "";
	const match = invoiceRows.find(entry => {
		try {
			const invoiceParams = new URL(entry.invoiceLink.href).searchParams;
			return (invoiceParams.get("txnId") ?? invoiceParams.get("srcTxnId")) === transactionId;
		} catch {
			return false;
		}
	});
	return match?.invoiceNumber ?? "";
}

/** @param {string[]} targetInvoiceNumbers */
async function selectExactInvoices(targetInvoiceNumbers) {
	const target = new Set(targetInvoiceNumbers);
	const initialRows = getInvoiceRows();
	const missing = targetInvoiceNumbers.filter(number => !initialRows.some(entry => entry.invoiceNumber === number));
	if (missing.length > 0) throw new Error(`QBO invoice rows not found: ${missing.join(", ")}.`);

	// QBO may preselect an invoice. Clear everything so saved manifest data is
	// the sole authority for the final checkbox state.
	for (const entry of initialRows) {
		if (entry.checkbox.checked) entry.checkbox.click();
	}
	await nextFrame();

	for (const invoiceNumber of targetInvoiceNumbers) {
		const entry = getInvoiceRows().find(row => row.invoiceNumber === invoiceNumber);
		if (!entry) throw new Error(`QBO invoice ${invoiceNumber} disappeared while selecting payments.`);
		if (!entry.checkbox.checked) entry.checkbox.click();
		await nextFrame();
	}

	const selectedInvoiceNumbers = getInvoiceRows()
		.filter(entry => entry.checkbox.checked)
		.map(entry => entry.invoiceNumber);
	const unexpected = selectedInvoiceNumbers.filter(number => !target.has(number));
	const stillMissing = targetInvoiceNumbers.filter(number => !selectedInvoiceNumbers.includes(number));
	if (unexpected.length > 0 || stillMissing.length > 0) {
		throw new Error(`Invoice selection did not verify. Missing: ${stillMissing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}.`);
	}
	return { selectedInvoiceNumbers };
}

function getInvoiceRows() {
	const rows = [];
	for (const row of document.querySelectorAll('tr[role="row"]')) {
		const checkbox = row.querySelector('input[type="checkbox"][aria-label="Select rows"]');
		const invoiceLink = row.querySelector('a[href*="/app/invoice?txnId="]');
		if (!(checkbox instanceof HTMLInputElement) || !(invoiceLink instanceof HTMLAnchorElement)) continue;
		const invoiceNumber = extractInvoiceNumber(invoiceLink.textContent ?? "");
		if (!invoiceNumber) continue;
		rows.push({ row, checkbox, invoiceLink, invoiceNumber });
	}
	return rows;
}

/** @param {string} labelText */
function findInputByLabel(labelText) {
	const normalizedTarget = normalize(labelText);
	const inputs = document.querySelectorAll("input:not([type='hidden']):not([type='checkbox']):not([type='radio'])");
	for (const input of inputs) {
		if (!(input instanceof HTMLInputElement)) continue;
		const ariaLabel = normalize(input.getAttribute("aria-label") ?? "");
		const placeholder = normalize(input.getAttribute("placeholder") ?? "");
		if (ariaLabel === normalizedTarget || placeholder === normalizedTarget) return input;
		if (input.id) {
			const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
			if (label && normalize(label.textContent ?? "").includes(normalizedTarget)) return input;
		}
		const containingLabel = input.closest("label");
		if (containingLabel && normalize(containingLabel.textContent ?? "").includes(normalizedTarget)) return input;
		const container = input.parentElement?.parentElement;
		if (container && normalize(container.textContent ?? "").includes(normalizedTarget)) return input;
	}
	return null;
}

/** @param {HTMLInputElement} input @param {string} value */
function setNativeInputValue(input, value) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (setter) setter.call(input, value);
	else input.value = value;
	input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
	input.blur();
	return input.value === value;
}

/** @param {string} methodName */
async function selectPaymentMethod(methodName) {
	if (!methodName) throw new Error("The saved payment method is empty.");
	const control = findPaymentMethodControl();
	if (!control) throw new Error("Payment method control was not found.");
	control.focus();
	control.click();
	const option = await waitForOption(methodName, control.getAttribute("aria-controls"));
	option.click();
	await nextFrame();
	const displayedValue = (control.value || control.getAttribute("value") || control.parentElement?.textContent || "")
		.replace(/\s+/g, " ").trim();
	if (!normalize(displayedValue).includes(normalize(methodName))) {
		throw new Error(`Payment method did not verify. Expected "${methodName}", found "${displayedValue}".`);
	}
	return { paymentType: methodName, paymentMethodDisplayedValue: displayedValue };
}

function findPaymentMethodControl() {
	const exact = document.querySelector('input[role="combobox"][aria-haspopup="listbox"][aria-label="Select method"]');
	if (exact instanceof HTMLInputElement) return exact;
	const fallback = document.querySelector('input[role="combobox"][aria-haspopup="listbox"][placeholder="Select method"]');
	return fallback instanceof HTMLInputElement ? fallback : null;
}

/** @param {string} methodName @param {string | null} controlledMenuId */
function waitForOption(methodName, controlledMenuId) {
	return new Promise((resolve, reject) => {
		const findOption = () => {
			const controlledMenu = controlledMenuId ? document.getElementById(controlledMenuId) : null;
			const options = controlledMenu
				? controlledMenu.querySelectorAll('[role="option"]')
				: document.querySelectorAll('[role="listbox"] [role="option"]');
			for (const option of options) {
				if (!(option instanceof HTMLElement)) continue;
				const titledValue = option.querySelector("[title]")?.getAttribute("title") ?? "";
				if (normalize(titledValue) === normalize(methodName) || normalize(option.textContent ?? "") === normalize(methodName)) return option;
			}
			return null;
		};
		const existing = findOption();
		if (existing) {
			resolve(existing);
			return;
		}
		const observer = new MutationObserver(() => {
			const option = findOption();
			if (!option) return;
			observer.disconnect();
			clearTimeout(timeout);
			resolve(option);
		});
		observer.observe(document.body, { childList: true, subtree: true });
		const timeout = window.setTimeout(() => {
			observer.disconnect();
			reject(new Error(`Payment method option "${methodName}" did not appear.`));
		}, OPTION_TIMEOUT_MS);
	});
}

/** @param {HTMLInputElement | null} input */
function readMoneyInput(input) {
	if (!input) return "";
	const amount = Number(input.value.replace(/[^0-9.-]/g, ""));
	return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function nextFrame() {
	return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/** @param {string} text */
function extractInvoiceNumber(text) {
	return text.match(/\bInvoice\s*#\s*(\d+)\b/i)?.[1] ?? "";
}

/** @param {string} value */
function normalize(value) {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}
