import test from "node:test";
import assert from "node:assert/strict";
import { setInvoiceItems, setPayerAliases, setTaxRateVars } from "../src/data/constants.js";
import { parsePayerAliases, resolveEffectivePayer } from "../src/logic/payerUtils.js";
import { formatEraInvoiceItem } from "../src/logic/invoiceUtils.js";
import { calculatePaymentBeforeTax } from "../src/logic/taxUtils.js";
import { buildItemTotals, foldNegativeLines } from "../src/logic/paymentSummary.js";

const CENTENNIAL = "Magellan (NO LONGE IN USE)Health Services Centennial";
const MAGELLAN = "Magellan Health Services";
const TURQUOISE = "Presbyterian - Turquoise";
const MANAGED = "Presbyterian Managed Care:Presbyterian Managed Care";
const CENTENNIAL_ITEM = "Presbyterian Centennial";
const taxableCentennial = { item: CENTENNIAL_ITEM, memo: "PRES", taxable: true, nonTaxableItem: MANAGED };

setTaxRateVars({ lasCruces: 0.0839, santaFe: 0.0919, lasCrucesLabel: "8.39%" });

// Magellan Centennial ERA (payment $1,191.30, adjustment ($176.16)).
const eraRows = [
	["NM Medicare Part B", CENTENNIAL, 2.06],
	["Tricare West", MAGELLAN, 8.11],
	[MAGELLAN, CENTENNIAL, 9.98],
	["Blue Cross Blue Shield of New Mexico", CENTENNIAL, -114.71],
	["Tricare West", MAGELLAN, 4.36],
	["UMR", CENTENNIAL, 3.36],
	[CENTENNIAL, "Not Set", 2.10],
	[CENTENNIAL, "Not Set", 2.00],
	["", "", 0.30],
	[CENTENNIAL, "Not Set", 1.59],
	[CENTENNIAL, "Not Set", 1.59],
	[CENTENNIAL, "Not Set", 1.59],
	[TURQUOISE, "Not Set", 235],
	[TURQUOISE, "Not Set", 235],
	[TURQUOISE, "Not Set", 235],
	[TURQUOISE, "Not Set", 270.13],
	[TURQUOISE, "Not Set", 235],
	[TURQUOISE, "Not Set", 235]
];

/** @param {{ [payer: string]: any }} invoiceItems @param {string[]} aliases */
function summarize(invoiceItems, aliases) {
	setInvoiceItems(invoiceItems);
	setPayerAliases(parsePayerAliases(aliases.map(alias => ({ "payer name": CENTENNIAL, aliases: alias }))));

	let lastPayer = null;
	const entries = eraRows.map(([primary, secondary, allocation]) => {
		const payerName = resolveEffectivePayer(primary, secondary, CENTENNIAL, lastPayer);
		lastPayer = payerName;
		const { adjustedRate, locationTag, taxRate, taxRateLabel, taxRateQbCode } =
			calculatePaymentBeforeTax(allocation, "Las Cruces Therapist", payerName);
		return {
			itemKey: formatEraInvoiceItem(payerName, CENTENNIAL, locationTag),
			allocation, invoiceRate: adjustedRate, taxRate, taxRateLabel, taxRateQbCode, payerName, locationTag
		};
	});

	const totals = buildItemTotals(entries, -176.16, lastPayer);
	return Object.fromEntries(Object.entries(totals).map(([key, line]) => [
		line.invoiceItem ?? key,
		[+line.totalAllocation.toFixed(2), +line.invoiceRate.toFixed(2)]
	]));
}

const baseItems = {
	[MAGELLAN]: { item: MANAGED, memo: "PRES" },
	"Magellan Health Services Centennial": taxableCentennial,
	[CENTENNIAL]: taxableCentennial,
	"Presbyterian NM": { item: MANAGED, memo: "PRES" }
};

test("old sheet: negative managed care line folds into Centennial", () => {
	const result = summarize(
		{ ...baseItems, [TURQUOISE]: taxableCentennial },
		[MAGELLAN, TURQUOISE]
	);
	assert.deepEqual(result, { [`${CENTENNIAL_ITEM} (Las Cruces)`]: [1191.30, 1099.09] });
});

test("updated sheet: negative Centennial line folds into managed care", () => {
	const result = summarize(
		{ ...baseItems, [TURQUOISE]: { item: MANAGED, memo: "PRES" } },
		[MAGELLAN]
	);
	assert.deepEqual(result, { [MANAGED]: [1191.30, 1191.30] });
});

test("splits a negative across positives and keeps an unabsorbable remainder", () => {
	setInvoiceItems({ Payer: { item: "Taxed", taxable: true, nonTaxableItem: "Untaxed" } });
	const line = (totalAllocation, taxRate = null) => ({ totalAllocation, invoiceRate: totalAllocation, taxRate, payerName: "Payer" });

	const split = { "Taxed (Las Cruces)": line(30, 0.0839), "Taxed (Santa Fe)": line(20, 0.0919), Untaxed: line(-40) };
	foldNegativeLines(split);
	assert.deepEqual(Object.keys(split), ["Taxed (Santa Fe)"]);
	assert.equal(split["Taxed (Santa Fe)"].totalAllocation, 10);

	const short = { "Taxed (Las Cruces)": line(30, 0.0839), Untaxed: line(-40) };
	foldNegativeLines(short);
	assert.deepEqual(Object.keys(short), ["Untaxed"]);
	assert.equal(short.Untaxed.totalAllocation, -10);
});
