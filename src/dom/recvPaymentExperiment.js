import { getCsvHistory } from "../data/csvHistory.js";

const RECEIVE_PAYMENT_PATH = "/app/recvpayment";
const LOG_PREFIX = "[CLC][Receive Payment]";
const TARGET_TIMEOUT_MS = 30000;
const OPTION_TIMEOUT_MS = 5000;
const SELECTION_SETTLE_MS = 750;

/** @typedef {{ invoiceNumber: string, amount: string }} InvoiceSelection */
/** @typedef {{ paymentReference: string, paymentDate: string, paymentAmount: string, paymentMemo: string, paymentType: string, requiresReview: boolean, invoiceSelections: InvoiceSelection[] }} SavedPayment */
/** @typedef {{ payments?: SavedPayment[] }} CsvExportRecord */
/** @typedef {{ row: HTMLTableRowElement, checkbox: HTMLInputElement, invoiceLink: HTMLAnchorElement, invoiceNumber: string }} InvoiceRow */

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
	const selectedInvoiceNumber = await waitForSettledCheckedInvoice();
	const payment = findPayment(history.exports, selectedInvoiceNumber);

	if (payment.requiresReview) {
		throw new Error(`Payment ${payment.paymentReference || "without a reference"} requires mapping review.`);
	}

	const targetInvoiceNumbers = payment.invoiceSelections.map(selection => selection.invoiceNumber);
	const invoiceSelection = await selectExactInvoices(targetInvoiceNumbers);
	const paymentMethod = await selectPaymentMethod(payment.paymentType);
	const paymentDateInput = findInputByLabel("Payment Date");
	if (!paymentDateInput) throw new Error("Payment date field was not found.");
	const paymentDateFilled = await setNativeInputValue(paymentDateInput, payment.paymentDate);
	const referenceInput = findInputByLabel("Reference no.");
	if (!referenceInput) throw new Error("Reference number field was not found.");
	const referenceFilled = await setNativeInputValue(referenceInput, payment.paymentMemo);

	return {
		paymentReference: payment.paymentReference,
		paymentMemo: payment.paymentMemo,
		paymentDate: payment.paymentDate,
		paymentDateFilled,
		referenceFilled,
		...paymentMethod,
		...invoiceSelection
	};
}

// Kept for the existing benchmark module while it is still in the repository.
export const runReceivePaymentExperiment = runReceivePaymentAutomation;

function automationTargetsReady() {
	return !!findInputByLabel("Reference no.") &&
		!!findInputByLabel("Payment Date") &&
		!!findPaymentMethodControl() &&
		getInvoiceRows().length > 0;
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
 * @param {CsvExportRecord[]} exports
 * @param {string} selectedInvoiceNumber
 * @returns {SavedPayment}
 */
function findPayment(exports, selectedInvoiceNumber) {
	const payments = exports.slice().reverse().flatMap(record => (record.payments ?? []).slice().reverse());
	const matches = payments.filter(payment =>
		payment.invoiceSelections?.some(selection => selection.invoiceNumber === selectedInvoiceNumber)
	);
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) throw new Error(`More than one saved payment contains invoice ${selectedInvoiceNumber}.`);
	throw new Error(`No saved TherapyNotes payment contains invoice ${selectedInvoiceNumber}.`);
}

function waitForSettledCheckedInvoice() {
	return new Promise((resolve, reject) => {
		let settleTimer = 0;
		const getChecked = () => getInvoiceRows().filter(entry => entry.checkbox.checked);
		const schedule = () => {
			clearTimeout(settleTimer);
			const checked = getChecked();
			if (checked.length !== 1) return;
			settleTimer = window.setTimeout(() => {
				const settled = getChecked();
				if (settled.length !== 1 || settled[0].invoiceNumber !== checked[0].invoiceNumber) {
					schedule();
					return;
				}
				observer.disconnect();
				clearTimeout(timeout);
				resolve(settled[0].invoiceNumber);
			}, SELECTION_SETTLE_MS);
		};
		const observer = new MutationObserver(schedule);
		observer.observe(document.body, { childList: true, subtree: true, attributes: true });
		const timeout = window.setTimeout(() => {
			observer.disconnect();
			clearTimeout(settleTimer);
			const count = getChecked().length;
			reject(new Error(`Expected one settled selected invoice, but found ${count}.`));
		}, TARGET_TIMEOUT_MS);
		schedule();
	});
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

/** @returns {InvoiceRow[]} */
function getInvoiceRows() {
	/** @type {InvoiceRow[]} */
	const rows = [];
	for (const row of document.querySelectorAll('tr[role="row"]')) {
		if (!(row instanceof HTMLTableRowElement)) continue;
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
async function setNativeInputValue(input, value) {
	// QBO commits this controlled field on focus/blur. Updating an unfocused DOM
	// input makes the text visible without necessarily updating the saved form state.
	input.focus();
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (setter) setter.call(input, value);
	else input.value = value;
	input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
	input.blur();
	await nextFrame();
	return input.value === value;
}

/** @param {HTMLInputElement} input @param {string} value */
async function setMoneyInputValue(input, value) {
	await setNativeInputValue(input, normalizeMoney(value));
	await nextFrame();
	return readMoneyInput(input);
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
