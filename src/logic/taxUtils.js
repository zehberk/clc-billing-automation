import {
	SANTA_FE_THERAPISTS,
	SANTA_FE_TAX_RATE,
	LAS_CRUCES_TAX_RATE,
	getUseMedicareOverride,
	getUseGehaOverride
} from "../data/constants.js";
import { isInvoiceItemTaxable } from "./invoiceUtils.js";

/** @param {string | null | undefined} fullName */
export function getTherapistLocation(fullName) {
	if (!fullName) return null;
	if (SANTA_FE_THERAPISTS.some(name => name.toLowerCase() === fullName.toLowerCase())) {
		return "Santa Fe";
	}
	return "Las Cruces";
}

/** @param {"Santa Fe" | "Las Cruces" | null} location */
export function getTaxRateForLocation(location) {
	switch (location) {
		case "Santa Fe": return SANTA_FE_TAX_RATE || 0;
		case "Las Cruces": return LAS_CRUCES_TAX_RATE || 0;
		default: return 0;
	}
}

/**
 * @param {number} allocation
 * @param {string | null | undefined} fullName
 * @param {string | null | undefined} payerName
 */
export function calculatePaymentBeforeTax(allocation, fullName, payerName) {
	if (getUseMedicareOverride() || getUseGehaOverride()) {
		return {
			adjustedRate: allocation,
			locationTag: null,
			taxRate: null
		};
	}
	
	let locationTag = null;
	let taxRate = null;	
	const isTaxable = isInvoiceItemTaxable(payerName);

	if (isTaxable) {
		locationTag = getTherapistLocation(fullName);
		taxRate = locationTag === "Santa Fe" ? SANTA_FE_TAX_RATE : LAS_CRUCES_TAX_RATE;
	}

	const adjustedRate = taxRate
		? +(allocation / (1 + taxRate))//.toFixed(2)
		: allocation;

	return { adjustedRate, locationTag, taxRate };
}

