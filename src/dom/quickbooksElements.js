/**
 * DOM helpers for QuickBooks pages.
 * Keep selectors and lightweight element operations here so feature modules
 * can focus on billing workflow logic.
 */

/**
 * @param {string} selector
 * @param {ParentNode} [root=document]
 */
export function getElement(selector, root = document) {
	const el = root.querySelector(selector);
	return el instanceof HTMLElement ? el : null;
}

/**
 * @param {string} selector
 * @param {string} text
 * @param {ParentNode} [root=document]
 */
export function setElementText(selector, text, root = document) {
	const el = getElement(selector, root);
	if (!el) return false;
	el.textContent = text;
	return true;
}

/**
 * Finds a value element by QuickBooks-style label/value row markup:
 * `.responsiveformtablerow` + `.form-label span` + `.form-input span`.
 *
 * @param {string} labelText
 * @param {ParentNode} [root=document]
 */
export function getValueByLabel(labelText, root = document) {
	const rows = root.querySelectorAll(".responsiveformtablerow");
	for (const row of rows) {
		const labelEl = row.querySelector(".form-label span");
		const valueEl = row.querySelector(".form-input span");
		if (!(labelEl instanceof HTMLElement)) continue;
		if (!(valueEl instanceof HTMLElement)) continue;

		if (labelEl.innerText.trim() === labelText) {
			return valueEl;
		}
	}

	return null;
}

/**
 * @param {string} labelText
 * @param {ParentNode} [root=document]
 */
export function getValueTextByLabel(labelText, root = document) {
	const valueEl = getValueByLabel(labelText, root);
	return valueEl?.innerText.trim() ?? null;
}
