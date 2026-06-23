const INVOICE_PATH = "/app/invoice";
const DEFAULT_CUSTOMER_NAME = "Therapy Notes";
const LOG_PREFIX = "[CLC Invoice AutoSelect]";
const TYPEAHEAD_CHUNK_SIZE = 3;

/**
 * Auto-selects the invoice customer when the QBO invoice page loads.
 * @param {string} [customerName]
 */
export function autoSelectInvoiceCustomer(customerName = DEFAULT_CUSTOMER_NAME) {
	log("init", { href: window.location.href, pathname: window.location.pathname, customerName });
	if (!isInvoicePage()) {
		log("skip: not invoice page");
		return;
	}
	if (document.body.dataset.qbInvoiceCustomerAutoSelect === "done") {
		log("skip: already done");
		return;
	}

	/** @type {number} */
	let attempts = 0;
	/** @type {number} */
	const maxAttempts = 90;
	/** @type {number} */
	const attemptDelayMs = 500;
	/** @type {number | null} */
	let timerId = null;
	/** @type {boolean} */
	let runningAttempt = false;

	/** @type {MutationObserver} */
	const observer = new MutationObserver(() => {
		// DOM changes can request an earlier attempt, but never run in parallel
		// and never bypass the scheduler loop.
		scheduleNextAttempt(50);
	});

	/** @returns {void} */
	const stop = () => {
		observer.disconnect();
		if (timerId) {
			clearTimeout(timerId);
			timerId = null;
		}
	};

	/**
	 * @param {number} delayMs
	 * @returns {void}
	 */
	const scheduleNextAttempt = (delayMs) => {
		if (attempts >= maxAttempts) return;
		if (timerId != null) return;
		timerId = window.setTimeout(() => {
			timerId = null;
			attemptSelect();
		}, delayMs);
	};

	/** @returns {void} */
	const attemptSelect = () => {
		if (runningAttempt) return;
		runningAttempt = true;

		if (attempts >= maxAttempts) {
			log("stop: max attempts reached");
			stop();
			runningAttempt = false;
			return;
		}

		attempts += 1;
		log("attempt", { attempts, maxAttempts });
		const selected = selectCustomer(customerName);
		if (selected) {
			document.body.dataset.qbInvoiceCustomerAutoSelect = "done";
			log("success: customer selected");
			stop();
			runningAttempt = false;
			return;
		}

		runningAttempt = false;
		scheduleNextAttempt(attemptDelayMs);
	};

	observer.observe(document.body, { childList: true, subtree: true });
	scheduleNextAttempt(0);
}

function isInvoicePage() {
	return window.location.pathname === INVOICE_PATH;
}

/**
 * @param {string} customerName
 */
function selectCustomer(customerName) {
	const currentDisplay = getCurrentCustomerDisplayText();
	log("selectCustomer: current display", { currentDisplay });
	if (normalize(currentDisplay) === normalize(customerName)) {
		log("selectCustomer: already selected");
		return true;
	}

	openCustomerPickerIfNeeded();
	const customerInput = findCustomerInput();
	if (customerInput) {
		log("selectCustomer: customer input found", {
			ariaLabel: customerInput.getAttribute("aria-label"),
			name: customerInput.getAttribute("name"),
			id: customerInput.id
		});
		customerInput.focus();
		customerInput.click();
		typeCustomerSearch(customerInput, customerName);
	} else {
		log("selectCustomer: no customer input, selecting from opened list");
	}

	const option = findCustomerOption(customerName);
	if (option) {
		log("selectCustomer: option found", { optionText: option.innerText?.trim() ?? "" });
		commitOptionSelection(customerInput, option);
		return true;
	}
	log("selectCustomer: no safe existing option found; skipping Enter fallback");
	return false;
}

/**
 * Finds the typeahead input if QuickBooks renders one.
 */
function findCustomerInput() {
	/** @type {string[]} */
	const selectors = [
		"input[aria-label='Customer']",
		"input[placeholder='Customer']",
		"input[placeholder*='customer' i]",
		"input[name*='customer' i]",
		"input[id*='customer' i]",
		"[role='combobox'][aria-label='Customer']",
		"[data-testid*='customer' i] input"
	];

	for (const selector of selectors) {
		const el = document.querySelector(selector);
		if (el instanceof HTMLInputElement) {
			log("findCustomerInput: matched selector", { selector });
			return el;
		}
	}

	const inputs = document.querySelectorAll("input, [role='combobox']");
	for (const el of inputs) {
		if (!(el instanceof HTMLElement)) continue;
		const label = [el.getAttribute("aria-label"), el.getAttribute("name"), el.id, el.getAttribute("placeholder")]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		if (label.includes("customer")) {
			if (el instanceof HTMLInputElement) return el;
			const nested = el.querySelector("input");
			if (nested instanceof HTMLInputElement) return nested;
		}
	}

	log("findCustomerInput: no candidate found");
	return null;
}

/**
 * @param {HTMLInputElement} input
 */
function getDisplayedValue(input) {
	return (input.value || input.getAttribute("value") || "").trim();
}

/**
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function setInputValue(input, value) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (setter) {
		setter.call(input, value);
	} else {
		input.value = value;
	}
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Gradually types into the typeahead so the option list can filter between attempts.
 * @param {HTMLInputElement} input
 * @param {string} customerName
 */
function typeCustomerSearch(input, customerName) {
	const target = customerName.trim();
	const currentRaw = getDisplayedValue(input);
	const current = normalize(currentRaw);
	const targetNormalized = normalize(target);
	if (!targetNormalized) return;
	if (current === targetNormalized) return;

	const nextLength =
		targetNormalized.startsWith(current) && current.length > 0
			? Math.min(target.length, currentRaw.length + TYPEAHEAD_CHUNK_SIZE)
			: Math.min(target.length, TYPEAHEAD_CHUNK_SIZE);

	const nextValue = target.slice(0, nextLength);
	log("typeCustomerSearch: typing chunk", {
		current: currentRaw,
		nextValue
	});
	setInputValue(input, nextValue);
}

/**
 * @param {string} customerName
 */
function findCustomerOption(customerName) {
	const options = document.querySelectorAll("[role='option'], [role='listbox'] li, [data-testid*='option' i]");
	log("findCustomerOption: option candidates", { count: options.length });
	/** @type {HTMLElement | null} */
	let bestMatch = null;

	for (const option of options) {
		if (!(option instanceof HTMLElement)) continue;
		const text = normalizeOptionText(option.innerText ?? "");
		if (!text) continue;

		// Never select the "Add new ..." row.
		if (isAddNewOptionText(text)) continue;

		const target = normalize(customerName);
		if (text === target) return option;

		// Prefer existing entity rows like: "Therapy Notes Customer"
		if (text.includes(target) && text.includes("customer")) {
			return option;
		}

		// Keep a fallback if name appears without the "customer" metadata text.
		if (text.includes(target) && bestMatch == null) {
			bestMatch = option;
		}
	}

	if (bestMatch) return bestMatch;

	log("findCustomerOption: no exact match", { customerName });
	return null;
}

function openCustomerPickerIfNeeded() {
	const trigger = findCustomerTrigger();
	if (!trigger) return;
	log("openCustomerPickerIfNeeded: clicking customer trigger", {
		text: trigger.innerText?.trim() ?? ""
	});
	trigger.click();
}

function findCustomerTrigger() {
	const triggerSelectors = [
		"button",
		"[role='button']",
		"[aria-haspopup='listbox']",
		"[data-testid*='customer' i]"
	];

	for (const selector of triggerSelectors) {
		const candidates = document.querySelectorAll(selector);
		for (const el of candidates) {
			if (!(el instanceof HTMLElement)) continue;
			const text = (el.innerText ?? "").trim();
			if (!text) continue;
			if (normalize(text) === "add customer") return el;
		}
	}
	return null;
}

/**
 * @returns {string}
 */
function getCurrentCustomerDisplayText() {
	const trigger = findCustomerTrigger();
	const triggerText = trigger?.innerText?.trim() ?? "";
	if (normalize(triggerText) === normalize(DEFAULT_CUSTOMER_NAME)) return triggerText;

	const customerInput = findCustomerInput();
	const inputText = customerInput?.value?.trim() ?? "";
	if (normalize(inputText) === normalize(DEFAULT_CUSTOMER_NAME)) return inputText;

	return triggerText || inputText;
}

/**
 * Click the selected list option and do nothing else.
 * QuickBooks should handle all downstream selection events.
 * @param {HTMLInputElement | null} input
 * @param {HTMLElement} option
 */
function commitOptionSelection(input, option) {
	log("commitOptionSelection: option click only");
	option.click();
	void input;
}

/**
 * @param {string} value
 */
function normalize(value) {
	return value.trim().toLowerCase();
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeOptionText(value) {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * @param {string} normalizedText
 * @returns {boolean}
 */
function isAddNewOptionText(normalizedText) {
	return /^add\s*new\b/.test(normalizedText);
}

/**
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
function log(message, details) {
	if (details === undefined) {
		console.log(LOG_PREFIX, message);
		return;
	}
	console.log(LOG_PREFIX, message, details);
}
