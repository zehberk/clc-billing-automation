import { USE_SECONDARY_PAYER, therapistNameCache } from "../data/constants.js";

/**
 * @param {HTMLTableRowElement} row
 * @param {number} index
 */
function getCellText(row, index) {
	const cell = row.children[index];
	return cell instanceof HTMLElement ? cell.innerText?.trim() : undefined;
}

/** @param {HTMLTableRowElement} row */
export function resolvePayerName(row) {
	let payer = getCellText(row, 9);
	const secondary = getCellText(row, 10);
	if (payer && USE_SECONDARY_PAYER.has(payer)) {
		return secondary || payer + " (verify)";
	}
	return payer;
}

/**
 * @param {HTMLTableRowElement} row
 * @param {string | null} lastTherapist
 */
export function resolveTherapistName(row, lastTherapist) {
	const href = row.children[6]?.querySelector("a")?.getAttribute("href");
	if (!href) return lastTherapist;

	const name = therapistNameCache[href];
	if (name === "__NOT_FOUND__") return lastTherapist;
	return name || lastTherapist;
}

/** @param {HTMLTableRowElement} row */
export function parseAllocation(row) {
	const str = getCellText(row, 17);
	if (!str) return 0;

	const isNegative = str.startsWith("(") && str.endsWith(")");
	const cleaned = str.replace(/[()$,]/g, "");
	const value = parseFloat(cleaned);

	return isNegative ? -value : value;
}

/** @param {string} name */
export function nameToRegex(name) {
	const [first, last] = name.trim().split(/\s+/);
	if (!first || !last) return null;	
	return new RegExp(`^${first}\\b(?:\\s+\\w+\\b)*\\s+${last}$`, "i");
}
