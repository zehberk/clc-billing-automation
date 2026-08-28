/**
 * Only a one-cent tax-rounding row may share the preceding invoice.
 * Allocation and adjustment rows always start a new invoice.
 *
 * @param {{ isTaxRounding?: boolean, isInvoiceContinuation?: boolean, totalAllocation?: string }} row
 */
export function shouldContinueInvoice(row) {
	if (!row.isTaxRounding || !row.isInvoiceContinuation) return false;

	const cents = parseMoneyToCents(row.totalAllocation);
	return cents === 1;
}

/** @param {string | undefined} value */
function parseMoneyToCents(value) {
	const raw = String(value ?? "").trim();
	const normalized = raw.replace(/[^0-9.-]/g, "");
	const amount = Number(normalized);
	if (!Number.isFinite(amount)) return 0;
	return Math.round((raw.includes("(") ? -Math.abs(amount) : amount) * 100);
}
