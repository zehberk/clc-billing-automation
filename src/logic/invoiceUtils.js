import { 
	PAYER_TO_INVOICE_ITEM_DATA,
	getUseMedicareOverride,
	getUseGehaOverride
} from "../data/constants.js";

/** @param {string | null | undefined} payerName */
export function normalizePayerName(payerName) {
	return payerName?.trim().toLowerCase().replace(/\.+$/, "");
}

/** @param {string | null | undefined} payerName */
export function getInvoiceItemData(payerName) {
	const normalized = normalizePayerName(payerName);
	const match = Object.entries(PAYER_TO_INVOICE_ITEM_DATA).find(
		([key]) => normalizePayerName(key) === normalized
	);
	return match?.[1];
}

/**
 * @param {string | null | undefined} payerName
 */
export function isInvoiceItemTaxable(payerName) {
	const match = getInvoiceItemData(payerName);
	return match?.taxable === true;
}

/** @param {string | null | undefined} payerName */
export function getNonTaxableInvoiceItem(payerName) {
	return getInvoiceItemData(payerName)?.nonTaxableItem;
}

/** @param {string} invoiceItem */
export function mapInvoiceItemToQbo(invoiceItem) {
	return invoiceItem.replace(/\s+\((?:Santa Fe|Las Cruces)\)$/, "").trim();
}

/**
 * @param {string | null | undefined} payerName
 * @param {string | null} locationTag
 */
export function formatInvoiceItem(payerName, locationTag) {
	if (getUseMedicareOverride()) return "Medicare:Medicare";
	if (getUseGehaOverride()) return "Managed Health Network";
	const match = getInvoiceItemData(payerName);
	const base = match?.item ?? `${payerName} — Please Verify`;
	return locationTag ? `${base} (${locationTag})` : base;
}

/**
 * Direct allocations on an ERA are untaxed and belong on the ERA payer's
 * configured non-taxable item.
 *
 * @param {string | null | undefined} payerName
 * @param {string | null | undefined} eraPayerName
 * @param {string | null} locationTag
 */
export function formatEraInvoiceItem(payerName, eraPayerName, locationTag) {
	if (normalizePayerName(payerName) === "direct") {
		const nonTaxableItem = getNonTaxableInvoiceItem(eraPayerName);
		if (nonTaxableItem) return nonTaxableItem;
	}

	return formatInvoiceItem(payerName, locationTag);
}

/**
 * @param {string | null | undefined} payerName
 * @param {string | null | undefined} transactionId
 */
export function resolveCheckMemo(payerName, transactionId) {
	if (getUseMedicareOverride()) return "MEDICARE";
	if (getUseGehaOverride()) return "MHN";
	const match = getInvoiceItemData(payerName);
	return match?.memo || transactionId || "Not Defined - Please Verify";
}

/** @param {string | null | undefined} payerName */
export function resolvePaymentMethod(payerName) {
	if (getUseMedicareOverride()) return "Medicare";
	if (getUseGehaOverride()) return "Managed Health Network";
	const match = getInvoiceItemData(payerName);
	return match?.paymentMethod || "Not Defined - Please Verify";
}
