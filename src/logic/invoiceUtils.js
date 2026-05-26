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
 * @param {string | null} locationTag
 */
export function formatInvoiceItem(payerName, locationTag) {
	if (getUseMedicareOverride()) return "Medicare";
	if (getUseGehaOverride()) return "Managed Health Network";
	const match = getInvoiceItemData(payerName);
	const base = match?.item ?? `${payerName} — Please Verify`;
	return locationTag ? `${base} (${locationTag})` : base;
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
