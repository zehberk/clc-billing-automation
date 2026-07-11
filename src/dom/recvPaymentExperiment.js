const EXPERIMENT_MARKER = "clcReceivePaymentExperiment";

// Proof-of-concept value for the Medicare transaction shown during testing.
// The final workflow will obtain this from the generated payment manifest.
const EXPERIMENTAL_REFERENCE_NUMBER = "MEDICARE";
const EXPERIMENTAL_PAYMENT_METHOD = "Medicare";
const TARGET_TIMEOUT_MS = 10000;
const OPTION_TIMEOUT_MS = 5000;

export async function runReceivePaymentExperiment() {
	if (document.body.dataset[EXPERIMENT_MARKER] === "done") {
		return { skipped: true, reason: "Experiment already ran on this screen." };
	}
	document.body.dataset[EXPERIMENT_MARKER] = "done";
	await waitForExperimentTargets();

	const referenceInput = findInputByLabel("Reference no.");
	const referenceFilled = referenceInput
		? setNativeInputValue(referenceInput, EXPERIMENTAL_REFERENCE_NUMBER)
		: false;

	const invoiceResult = selectNextInvoiceAfterChecked();
	const paymentMethodResult = await selectPaymentMethod(EXPERIMENTAL_PAYMENT_METHOD);
	return {
		referenceNumber: EXPERIMENTAL_REFERENCE_NUMBER,
		referenceFilled,
		...paymentMethodResult,
		...invoiceResult
	};
}

function experimentTargetsReady() {
	const referenceInput = findInputByLabel("Reference no.");
	const paymentMethodControl = findPaymentMethodControl();
	const checkboxes = /** @type {HTMLInputElement[]} */ (
		Array.from(document.querySelectorAll('tr[role="row"] input[type="checkbox"][aria-label="Select rows"]'))
			.filter(checkbox => checkbox instanceof HTMLInputElement)
	);
	const checkedIndex = checkboxes.findIndex(checkbox => checkbox.checked);
	const hasUncheckedAfter = checkedIndex >= 0 && checkboxes.slice(checkedIndex + 1).some(checkbox => !checkbox.checked);
	return !!referenceInput && !!paymentMethodControl && hasUncheckedAfter;
}

/** @returns {Promise<void>} */
function waitForExperimentTargets() {
	return new Promise((resolve, reject) => {
		if (experimentTargetsReady()) {
			resolve();
			return;
		}
		const observer = new MutationObserver(() => {
			if (!experimentTargetsReady()) return;
			observer.disconnect();
			clearTimeout(timeout);
			resolve();
		});
		observer.observe(document.body, { childList: true, subtree: true, characterData: true });
		const timeout = window.setTimeout(() => {
			observer.disconnect();
			reject(new Error(`Experimental controls were not ready after ${TARGET_TIMEOUT_MS / 1000}s.`));
		}, TARGET_TIMEOUT_MS);
	});
}

/**
 * @param {string} labelText
 * @returns {HTMLInputElement | null}
 */
function findInputByLabel(labelText) {
	const normalizedTarget = normalize(labelText);
	const inputs = document.querySelectorAll("input:not([type='hidden']):not([type='checkbox']):not([type='radio'])");

	for (const input of inputs) {
		if (!(input instanceof HTMLInputElement)) continue;
		const ariaLabel = normalize(input.getAttribute("aria-label") ?? "");
		const placeholder = normalize(input.getAttribute("placeholder") ?? "");
		if (ariaLabel === normalizedTarget || placeholder === normalizedTarget) return input;

		if (input.id) {
			const escapedId = CSS.escape(input.id);
			const label = document.querySelector(`label[for="${escapedId}"]`);
			if (label && normalize(label.textContent ?? "").includes(normalizedTarget)) return input;
		}

		const containingLabel = input.closest("label");
		if (containingLabel && normalize(containingLabel.textContent ?? "").includes(normalizedTarget)) return input;

		const container = input.parentElement?.parentElement;
		if (container && normalize(container.textContent ?? "").includes(normalizedTarget)) return input;
	}

	return null;
}

/**
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function setNativeInputValue(input, value) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (setter) setter.call(input, value);
	else input.value = value;

	input.dispatchEvent(new InputEvent("input", {
		bubbles: true,
		inputType: "insertText",
		data: value
	}));
	input.dispatchEvent(new Event("change", { bubbles: true }));
	input.blur();
	return input.value === value;
}

/** @param {string} methodName */
async function selectPaymentMethod(methodName) {
	const control = findPaymentMethodControl();
	if (!control) return { paymentMethod: methodName, paymentMethodSelected: false, reason: "Payment method control not found." };

	control.focus();
	control.click();
	const option = await waitForOption(methodName, control.getAttribute("aria-controls"));
	option.click();

	await nextFrame();
	const displayedValue = (control.value || control.getAttribute("value") || control.parentElement?.textContent || "")
		.replace(/\s+/g, " ")
		.trim();
	return {
		paymentMethod: methodName,
		paymentMethodSelected: normalize(displayedValue).includes(normalize(methodName)),
		paymentMethodDisplayedValue: displayedValue
	};
}

function findPaymentMethodControl() {
	const exact = document.querySelector(
		'input[role="combobox"][aria-haspopup="listbox"][aria-label="Select method"]'
	);
	if (exact instanceof HTMLInputElement) return exact;

	const fallback = document.querySelector(
		'input[role="combobox"][aria-haspopup="listbox"][placeholder="Select method"]'
	);
	return fallback instanceof HTMLInputElement ? fallback : null;
}

/**
 * @param {string} methodName
 * @param {string | null} controlledMenuId
 * @returns {Promise<HTMLElement>}
 */
function waitForOption(methodName, controlledMenuId) {
	return new Promise((resolve, reject) => {
		/** @returns {HTMLElement | null} */
		const findOption = () => {
			const controlledMenu = controlledMenuId ? document.getElementById(controlledMenuId) : null;
			const options = controlledMenu
				? controlledMenu.querySelectorAll('[role="option"]')
				: document.querySelectorAll('[role="listbox"] [role="option"]');
			for (const option of options) {
				if (!(option instanceof HTMLElement)) continue;
				const titledValue = option.querySelector("[title]")?.getAttribute("title") ?? "";
				if (normalize(titledValue) === normalize(methodName)) return option;
				if (normalize(option.textContent ?? "") === normalize(methodName)) return option;
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

/** @returns {Promise<void>} */
function nextFrame() {
	return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function selectNextInvoiceAfterChecked() {
	/** @type {{ row: Element, checkbox: HTMLInputElement, invoiceLink: HTMLAnchorElement }[]} */
	const rows = [];
	for (const row of document.querySelectorAll('tr[role="row"]')) {
		const checkbox = row.querySelector('input[type="checkbox"][aria-label="Select rows"]');
		const invoiceLink = row.querySelector('a[href*="/app/invoice?txnId="]');
		if (!(checkbox instanceof HTMLInputElement)) continue;
		if (!(invoiceLink instanceof HTMLAnchorElement)) continue;
		rows.push({ row, checkbox, invoiceLink });
	}

	const checkedIndex = rows.findIndex(entry => entry.checkbox.checked);
	if (checkedIndex < 0) {
		return { invoiceClicked: false, reason: "No checked invoice row was found." };
	}

	const nextEntry = rows.slice(checkedIndex + 1).find(entry => !entry.checkbox.checked);
	if (!nextEntry) {
		return { invoiceClicked: false, reason: "No unchecked invoice follows the checked row." };
	}

	const invoiceNumber = extractInvoiceNumber(nextEntry.invoiceLink.textContent ?? "");
	nextEntry.checkbox.click();
	return {
		invoiceClicked: true,
		invoiceNumber,
		invoiceCheckedAfterClick: nextEntry.checkbox.checked
	};
}

/** @param {string} text */
function extractInvoiceNumber(text) {
	return text.match(/#\s*(\d+)/)?.[1] ?? text.replace(/\s+/g, " ").trim();
}

/** @param {string} value */
function normalize(value) {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}
