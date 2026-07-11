import {
	SANTA_FE_THERAPISTS,
	SANTA_FE_TAX_RATE,
	LAS_CRUCES_TAX_RATE,
	SANTA_FE_TAX_RATE_LABEL,
	LAS_CRUCES_TAX_RATE_LABEL,
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
			taxRate: null,
			taxRateLabel: ""
		};
	}
	
	let locationTag = null;
	let taxRate = null;	
	let taxRateLabel = "";
	const isTaxable = isInvoiceItemTaxable(payerName);

	if (isTaxable) {
		locationTag = getTherapistLocation(fullName);
		taxRate = locationTag === "Santa Fe" ? SANTA_FE_TAX_RATE : LAS_CRUCES_TAX_RATE;
		taxRateLabel = locationTag === "Santa Fe" ? SANTA_FE_TAX_RATE_LABEL : LAS_CRUCES_TAX_RATE_LABEL;
	}

	const adjustedRate = taxRate
		? +(allocation / (1 + taxRate))//.toFixed(2)
		: allocation;

	return { adjustedRate, locationTag, taxRate, taxRateLabel };
}

/**
 * Find the cent-rounded taxable line amount whose QBO-calculated gross is
 * closest to the desired TherapyNotes gross amount.
 *
 * @param {number} grossAmount
 * @param {number} taxRate
 */
export function calculateQboTaxableLine(grossAmount, taxRate) {
	const grossCents = Math.round(grossAmount * 100);
	if (!taxRate) {
		return {
			taxableAmount: grossCents / 100,
			taxAmount: 0,
			qboGrossAmount: grossCents / 100,
			roundingAdjustment: 0
		};
	}

	const estimatedTaxableCents = Math.round(grossCents / (1 + taxRate));
	let best = null;

	for (let offset = -3; offset <= 3; offset += 1) {
		const taxableCents = estimatedTaxableCents + offset;
		const taxCents = Math.round(taxableCents * taxRate);
		const qboGrossCents = taxableCents + taxCents;
		const differenceCents = grossCents - qboGrossCents;
		const candidate = {
			taxableCents,
			taxCents,
			qboGrossCents,
			differenceCents
		};

		if (
			best == null ||
			Math.abs(candidate.differenceCents) < Math.abs(best.differenceCents) ||
			(
				Math.abs(candidate.differenceCents) === Math.abs(best.differenceCents) &&
				Math.abs(offset) < Math.abs(best.offset)
			)
		) {
			best = { ...candidate, offset };
		}
	}

	return {
		taxableAmount: best.taxableCents / 100,
		taxAmount: best.taxCents / 100,
		qboGrossAmount: best.qboGrossCents / 100,
		roundingAdjustment: best.differenceCents / 100
	};
}

