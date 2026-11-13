import { formatInvoiceItem, getNonTaxableInvoiceItem } from "./invoiceUtils.js";
import { calculateQboTaxableLine } from "./taxUtils.js";

/** @typedef {{ itemKey: string, allocation: number, invoiceRate: number, taxRate: number | null, taxRateLabel: string, taxRateQbCode: string, payerName: string, checkMemoPayer?: string, locationTag: string | null }} SummaryEntry */
/** @typedef {{ totalAllocation: number, invoiceRate: number, taxRate: number | null, taxRateLabel?: string, taxRateQbCode?: string, payerName: string, checkMemoPayer?: string, invoiceItem?: string, roundingFor?: string, continuationFor?: string }} ItemTotal */
/** @typedef {{ [itemKey: string]: ItemTotal }} ItemTotalsMap */

/**
 * Aggregate ERA rows into QuickBooks invoice lines.
 *
 * @param {SummaryEntry[]} entries
 * @param {number} adjustmentTotal
 * @param {string | null} fallbackPayer
 * @returns {ItemTotalsMap}
 */
export function buildItemTotals(entries, adjustmentTotal, fallbackPayer) {
	/** @type {ItemTotalsMap} */
	const itemTotalsMap = {};
	for (const entry of entries) {
		const { itemKey, allocation, invoiceRate, taxRate, taxRateLabel, taxRateQbCode, payerName, checkMemoPayer } = entry;
		if (!itemTotalsMap[itemKey]) {
			itemTotalsMap[itemKey] = {
				totalAllocation: 0,
				invoiceRate: 0,
				taxRate,
				taxRateLabel,
				taxRateQbCode,
				payerName,
				checkMemoPayer
			};
		}
		itemTotalsMap[itemKey].totalAllocation += allocation;
		itemTotalsMap[itemKey].invoiceRate += invoiceRate;
		itemTotalsMap[itemKey].taxRate = taxRate;
		itemTotalsMap[itemKey].taxRateLabel = taxRateLabel;
		itemTotalsMap[itemKey].taxRateQbCode = taxRateQbCode;
	}

	if (adjustmentTotal !== 0) {
		// Adjustments are always untaxed. Prefer the resolved payer from a taxable
		// allocation so its spreadsheet-configured non-taxable invoice item is
		// used instead of the page-level payer shown in the payment header.
		const taxableEntry = entries.find(entry =>
			entry.taxRate != null && getNonTaxableInvoiceItem(entry.payerName)
		);
		const adjustmentPayer = taxableEntry?.payerName || fallbackPayer || "Payment Adjustment";
		const nonTaxableInvoiceItem = getNonTaxableInvoiceItem(adjustmentPayer);
		const adjustmentItemKey = nonTaxableInvoiceItem || formatInvoiceItem(adjustmentPayer, null);
		const adjustmentItem = itemTotalsMap[adjustmentItemKey] ?? {
			totalAllocation: 0,
			invoiceRate: 0,
			taxRate: null,
			payerName: adjustmentPayer,
			invoiceItem: nonTaxableInvoiceItem,
			continuationFor: taxableEntry?.itemKey
		};
		itemTotalsMap[adjustmentItemKey] = adjustmentItem;

		adjustmentItem.totalAllocation += adjustmentTotal;
		adjustmentItem.invoiceRate += adjustmentTotal;
	}

	foldNegativeLines(itemTotalsMap);

	// QBO calculates tax from the cent-rounded, aggregated taxable line. Match
	// that behavior and use a separate untaxed line for any remaining penny.
	for (const [itemKey, itemTotal] of Object.entries(itemTotalsMap)) {
		if (itemTotal.taxRate == null) continue;

		const result = calculateQboTaxableLine(itemTotal.totalAllocation, itemTotal.taxRate);
		itemTotal.invoiceRate = result.taxableAmount;
		itemTotal.totalAllocation = result.qboGrossAmount;

		if (result.roundingAdjustment !== 0) {
			const roundingKey = `Tax Rounding Adjustment — ${itemKey}`;
			itemTotalsMap[roundingKey] = {
				totalAllocation: result.roundingAdjustment,
				invoiceRate: result.roundingAdjustment,
				taxRate: null,
				payerName: itemTotal.payerName,
				invoiceItem: getNonTaxableInvoiceItem(itemTotal.payerName) ?? `${itemKey} — NON-TAXABLE ITEM REQUIRED`,
				roundingFor: itemKey
			};
		}
	}

	return itemTotalsMap;
}

/**
 * QuickBooks rejects negative invoice lines. A payer's taxable line and its
 * configured non-taxable line form one group; a negative line in that group
 * is netted into the group's largest positive line(s). Folding into a taxable
 * line treats the amount as tax-inclusive. Runs before tax rounding, while
 * taxable totals are still gross amounts.
 *
 * @param {ItemTotalsMap} itemTotalsMap
 */
export function foldNegativeLines(itemTotalsMap) {
	/** @type {Map<string, string[]>} */
	const groups = new Map();
	for (const [key, line] of Object.entries(itemTotalsMap)) {
		const group = line.taxRate != null
			? getNonTaxableInvoiceItem(line.payerName)
			: line.invoiceItem ?? key;
		if (!group) continue;
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)?.push(key);
	}

	/** @param {string} key */
	const cents = key => Math.round(itemTotalsMap[key].totalAllocation * 100);
	/** @param {string} key @param {number} value */
	const setCents = (key, value) => {
		const line = itemTotalsMap[key];
		line.totalAllocation = value / 100;
		// Taxable invoice rates are recalculated from the gross during rounding.
		if (line.taxRate == null) line.invoiceRate = value / 100;
	};

	for (const keys of groups.values()) {
		const negatives = keys.filter(key => cents(key) < 0);
		if (!negatives.length) continue;
		const positives = keys
			.filter(key => cents(key) > 0)
			.sort((a, b) => cents(b) - cents(a));

		for (const negative of negatives) {
			let remaining = -cents(negative);
			for (const positive of positives) {
				if (remaining === 0) break;
				const absorbed = Math.min(remaining, cents(positive));
				setCents(positive, cents(positive) - absorbed);
				remaining -= absorbed;
			}
			setCents(negative, -remaining);
		}

		for (const key of keys) {
			if (cents(key) === 0) delete itemTotalsMap[key];
		}
	}
}
