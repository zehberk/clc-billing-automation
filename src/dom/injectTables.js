import { therapistNameCache, USE_SECONDARY_PAYER  } from "../data/constants.js";
import { resolveTherapistName, parseAllocation } from "../logic/rowUtils.js";
import { normalizePayerName, formatInvoiceItem, formatEraInvoiceItem, resolveCheckMemo, resolvePaymentMethod, isInvoiceItemTaxable, getNonTaxableInvoiceItem } from "../logic/invoiceUtils.js";
import { calculatePaymentBeforeTax, calculateQboTaxableLine } from "../logic/taxUtils.js";
import { getPaymentField } from "../logic/paymentFields.js";
import { setPaymentSummaryMethods } from "../data/paymentSummaryMetadata.js";

/** @typedef {{ itemKey: string, allocation: number, invoiceRate: number, taxRate: number | null, taxRateLabel: string, taxRateQbCode: string, payerName: string, checkMemoPayer?: string, locationTag: string | null }} SummaryEntry */
/** @typedef {{ totalAllocation: number, invoiceRate: number, taxRate: number | null, taxRateLabel?: string, taxRateQbCode?: string, payerName: string, checkMemoPayer?: string, invoiceItem?: string, roundingFor?: string, continuationFor?: string }} ItemTotal */
/** @typedef {{ [itemKey: string]: ItemTotal }} ItemTotalsMap */

/** @param {string | null | undefined} primary */
function shouldForceSecondary(primary) {
	if (!primary) return false;
	const p = normalizePayerName(primary);
	for (const val of USE_SECONDARY_PAYER) {
		if (normalizePayerName(val) === p) return true;
	}
	return false;
}

/**
 * @param {string} primary
 * @param {string} secondary
 * @param {string | null} pageLevelPayer
 * @param {string | null | undefined} transactionId
 * @param {string | null} lastPayer
 */
function resolveEffectivePayer(primary, secondary, pageLevelPayer, transactionId, lastPayer) {
	let payerName = primary || lastPayer;

	if (shouldForceSecondary(primary) && secondary) payerName = secondary;

	const primaryMemo   = resolveCheckMemo(primary, transactionId);

	if (
		primary &&
		pageLevelPayer &&
		primary !== pageLevelPayer &&
		primaryMemo &&
		// pageLevelMemo &&
		// primaryMemo !== pageLevelMemo &&
		!pageLevelPayer.toLowerCase().includes(primaryMemo.toLowerCase()) &&
		secondary &&
		secondary !== "Not Set"
		// secondaryMemo === pageLevelMemo
	) {
		payerName = secondary;
	}

	return payerName || lastPayer || "";
}

export async function injectPaymentSummary() {
	if (document.querySelector("#QuickBooksSummaryTable")) return;

	const paymentTable = document.querySelector("#BillingTransactionsTableList");
	const adjustmentsTable = document.querySelector("#AdjustmentsTableList");
	const anchorTable = paymentTable || adjustmentsTable;
	if (!(anchorTable instanceof HTMLTableElement)) return;

	/** @type {HTMLTableRowElement[]} */
	const rows = paymentTable instanceof HTMLTableElement
		? Array.from(paymentTable.querySelectorAll("tbody tr"))
		: [];

	// Page-level payer
	const pageLevelPayer = (() => {
		const rows = document.querySelectorAll(".responsiveformtablerow");
		for (const row of rows) {
			const labelEl = row.querySelector(".form-label span");
			const valueEl = row.querySelector(".form-input span");
			if (
				labelEl instanceof HTMLElement &&
				labelEl.innerText.trim() === "Payer:" &&
				valueEl instanceof HTMLElement
			) {
				return valueEl.innerText.trim();
			}
		}
		return null;
	})();

	let lastTherapist = null;
	/** @type {string | null} */
	let lastPayer = null;
	let eraInvoicePayer = null;
	/** @type {Promise<void>[]} */
	const fetchPromises = [];
	const transactionId = getPaymentField("Transaction ID:");

	// -------- Prefetch therapist names using the EFFECTIVE payer --------
	rows.forEach(row => {
		const primary   = row.children[9]  instanceof HTMLElement ? row.children[9].innerText.trim()  : "";
		const secondary = row.children[10] instanceof HTMLElement ? row.children[10].innerText.trim() : "";

		const effective = resolveEffectivePayer(primary, secondary, pageLevelPayer, transactionId, lastPayer);
		if (effective) lastPayer = effective;
		if (!eraInvoicePayer && isInvoiceItemTaxable(effective) && getNonTaxableInvoiceItem(effective)) {
			eraInvoicePayer = effective;
		}

		// Prefetch therapist names only when the invoice item needs location-based tax logic
		if (isInvoiceItemTaxable(effective)) {
			const href = row.children[6]?.querySelector("a")?.getAttribute("href");
			if (href && !therapistNameCache.hasOwnProperty(href)) {
				fetchPromises.push(
					getTherapistNameFromTitle(href).then(name => {
						therapistNameCache[href] = name || "__NOT_FOUND__";
					})
				);
			}
		}
	});

	await Promise.all(fetchPromises);

	// -------- Build entries with consistent effective payer + location --------
	/** @type {SummaryEntry[]} */
	const entries = [];
	lastPayer = null; // reset for the main pass

	for (const row of rows) {
		const primary   = row.children[9]  instanceof HTMLElement ? row.children[9].innerText.trim()  : "";
		const secondary = row.children[10] instanceof HTMLElement ? row.children[10].innerText.trim() : "";

		let payerName = resolveEffectivePayer(primary, secondary, pageLevelPayer, transactionId, lastPayer);
		if (payerName) lastPayer = payerName;

		const allocation = parseAllocation(row);
		if (!allocation) continue;

		// Resolve therapist only for taxable invoice items that need a location tag
		let fullName = resolveTherapistName(row, lastTherapist);
		if (fullName) lastTherapist = fullName;

		// Tax/location calc (this sets locationTag based on the invoice item's taxable flag)
		let { adjustedRate, locationTag, taxRate, taxRateLabel, taxRateQbCode } =
			calculatePaymentBeforeTax(allocation, fullName, payerName);

		// Group key keeps taxable rows together by location
		const itemKey = formatEraInvoiceItem(payerName, eraInvoicePayer || pageLevelPayer, locationTag);

		entries.push({
			itemKey,
			allocation,
			invoiceRate: adjustedRate,
			taxRate,
			 taxRateLabel,
			taxRateQbCode,
			payerName,
			checkMemoPayer: normalizePayerName(payerName) === "direct"
				? eraInvoicePayer || pageLevelPayer || undefined
				: undefined,
			locationTag
		});
	}

	// -------- Aggregate --------
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

	// -------- Adjustments --------
	const adjustmentTotal = getAdjustmentTotal();
	if (adjustmentTotal !== 0) {
		// Adjustments are always untaxed. Prefer the resolved payer from a taxable
		// allocation so its spreadsheet-configured non-taxable invoice item is
		// used instead of the page-level payer shown in the payment header.
		const taxableEntry = entries.find(entry =>
			entry.taxRate != null && getNonTaxableInvoiceItem(entry.payerName)
		);
		const adjustmentPayer = taxableEntry?.payerName || lastPayer || pageLevelPayer || "Payment Adjustment";
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

	// -------- Render --------
	const summaryTable = document.createElement("table");
	summaryTable.id = "QuickBooksSummaryTable";
	summaryTable.className = "qb-summary-table";

	const sortedEntries = Object.entries(itemTotalsMap).sort(([aKey, a], [bKey, b]) => {
		const anchorComparison = (a.roundingFor ?? a.continuationFor ?? aKey).localeCompare(b.roundingFor ?? b.continuationFor ?? bKey);
		if (anchorComparison !== 0) return anchorComparison;
		return Number(a.roundingFor != null || a.continuationFor != null) - Number(b.roundingFor != null || b.continuationFor != null);
	});

	let bodyRows = "";
	const rowPaymentMethods = [];
	for (const [itemKey, data] of sortedEntries) {
		const { totalAllocation, invoiceRate, taxRate, taxRateLabel, taxRateQbCode, payerName } = data;
		const item = data.invoiceItem ?? itemKey;
		const checknum = resolveCheckMemo(data.checkMemoPayer ?? payerName, transactionId);
		const paymentMethod = resolvePaymentMethod(payerName);
		rowPaymentMethods.push(paymentMethod);

		bodyRows += `
			<tr style="background-color: #f9fef9;"${taxRateQbCode ? ` data-clc-tax-code="${taxRateQbCode}"` : ""}${data.roundingFor != null ? ' data-clc-tax-rounding="true"' : ''}${data.roundingFor != null || data.continuationFor != null ? ' data-clc-invoice-continuation="true"' : ''}>
				<td style="padding: 6px;">${item}</td>
				<td style="padding: 6px; text-align: right;">$${totalAllocation.toFixed(2)}</td>
				<td style="padding: 6px; text-align: right;">${taxRate != null ? (taxRateLabel || `${taxRate * 100}%`) : ""}</td>
				<td style="padding: 6px; text-align: right;">$${invoiceRate.toFixed(2)}</td>
				<td style="padding: 6px; text-align: center;">${checknum}</td>
			</tr>
		`;
	}

	summaryTable.innerHTML = `
		<thead style="background-color: #d4edda;">
			<tr>
				<th colspan="5" style="padding: 10px; color: #155724; font-size: 16px; text-align: left;">
					✅ QuickBooks Payment Entry
				</th>
			</tr>
			<tr style="background-color: #eaf5ea;">
				<th style="padding: 8px; text-align: left;">Invoice Item</th>
				<th style="padding: 8px; text-align: right;">Total Allocation</th>
				<th style="padding: 8px; text-align: right;">Tax Rate</th>
				<th style="padding: 8px; text-align: right;">Invoice Rate</th>
				<th style="padding: 8px; text-align: center;">Check Memo</th>
			</tr>
		</thead>
		<tbody>${bodyRows}</tbody>
	`;
	setPaymentSummaryMethods(summaryTable, rowPaymentMethods);

	if (anchorTable.parentNode) {
		anchorTable.parentNode.insertBefore(summaryTable, anchorTable);
	}

	// -------- Error Checking ---------
	const calculatedTotal = Object.values(itemTotalsMap).reduce((sum, data) => sum + data.totalAllocation, 0)
	const paymentAmountStr = getPaymentField("Payment Amount:");
	const paymentAmount = paymentAmountStr
		? parseFloat(paymentAmountStr.replace(/[^0-9.]/g, ""))
		: null;

	let totalsMismatch = false;

	if (paymentAmount != null) {
		const roundedCalc = parseFloat(calculatedTotal.toFixed(2));
		const roundedERA  = parseFloat(paymentAmount.toFixed(2));

		if (roundedCalc !== roundedERA) {
			totalsMismatch = true;
		}
	}

	if (totalsMismatch) {
		const banner = document.createElement("div");
		banner.className = "qb-payment-warning";
		banner.style.background = "#fff3cd";
		banner.style.color = "#856404";
		banner.style.border = "1px solid #ffeeba";
		banner.style.padding = "10px";
		banner.style.marginBottom = "12px";
		banner.style.fontSize = "15px";
		banner.style.fontWeight = "600";
	
		banner.textContent =
			"Payment Warning: Calculated allocations do not match the ERA payment amount. Please verify.";
	
		summaryTable.parentNode?.insertBefore(banner, summaryTable);
	}	
}

/** @param {string} reason */
export function injectSkipWarning(reason) {
	const paymentTable = document.querySelector('#BillingTransactionsTableList');
	if (!paymentTable) return;

	const warning = document.createElement("table");
	warning.className = "qb-warning-table";
	warning.innerHTML = `
		<thead>
			<tr>
				<th colspan="2" style="
					padding: 10px;
					color: #7c6f00;
					font-size: 16px;
					text-align: left;
				">
					<div style="
						display: flex;
						align-items: center;
						gap: 8px;
						line-height: 1.2;
					">
						<svg viewBox="0 0 24 24" width="18" height="18" style="display: block;">
							<circle cx="12" cy="12" r="10" fill="#fff4cc" stroke="#b38f00" stroke-width="2" />
							<text x="12" y="16" text-anchor="middle" font-size="12" fill="#7c6f00" font-family="sans-serif" font-weight="bold">i</text>
						</svg>
						<span style="display: block;">Do Not Enter Payment Into QuickBooks</span>
					</div>
				</th>
			</tr>
		</thead>
		<tbody>
			<tr style="background-color: #fff8e1;">
				<td style="padding: 10px;" colspan="2">
					This payment can be skipped because ${reason}.
				</td>
			</tr>
		</tbody>
	`;

	if (paymentTable.parentNode) {
		paymentTable.parentNode.insertBefore(warning, paymentTable);
	}
}

/** @param {string} hrefWithTab */
async function getTherapistNameFromTitle(hrefWithTab) {
	const url = hrefWithTab.split("?")[0];
	try {
		const response = await fetch(url);
		const html = await response.text();
		const match = html.match(/<title>\s*(.+?)\s+\|\s+TherapyNotes\s*<\/title>/i);
		if (match && match[1]) return match[1].trim();
		return null;
	} catch {
		return null;
	}
}

function getAdjustmentTotal() {
	const table = document.querySelector("#AdjustmentsTableList");
	if (!table) return 0;

	const rows = table.querySelectorAll("tbody tr");
	if (!rows.length) return 0;

	let total = 0;

	for (const row of rows) {
		const td = row.querySelectorAll("td")[1];
		if (!td) continue;

		const raw = td.textContent?.trim();
		if (!raw) continue;

		// raw examples:
		//   "$91.74"
		//   "($110.30)"

		let value = raw.replace(/[^\d.-]/g, "");
		// Parentheses = negative
		if (raw.includes("(")) value = "-" + value;

		const amount = parseFloat(value);
		if (Number.isFinite(amount)) total += amount;
	}

	return total;
}
