import test from "node:test";
import assert from "node:assert/strict";
import { setPayerAliases, setInvoiceItems } from "../src/data/constants.js";
import { parsePayerAliases, resolveEffectivePayer } from "../src/logic/payerUtils.js";
import { formatInvoiceItem } from "../src/logic/invoiceUtils.js";

const header = "Magellan (NO LONGE IN USE)Health Services Centennial";
const primary = "Magellan Health Services";
setPayerAliases(parsePayerAliases([
	{ "payer name": header, aliases: primary },
	{ "payer name": header, aliases: "Another Magellan name" },
	{ "payer name": "", aliases: "Incomplete" }
]));

test("Magellan aliases retain primary despite unrelated secondary coverage", () => {
	for (const secondary of ["United Healthcare", "Blue Cross Community", "Not Set"]) {
		assert.equal(resolveEffectivePayer(primary, secondary, header, null), primary);
	}
	assert.equal(resolveEffectivePayer(" another magellan name. ", "United", header, null), " another magellan name. ");
});

test("switches only to a secondary matching the payment payer", () => {
	assert.equal(resolveEffectivePayer("Other payer", primary, header, null), primary);
	assert.equal(resolveEffectivePayer("Other payer", "United", "United", null), "United");
	assert.equal(resolveEffectivePayer(primary, "United", "Unknown header", null), primary);
	assert.equal(resolveEffectivePayer(primary, "United", null, null), primary);
});

test("preserves Medicare exception but rejects Not Set secondary", () => {
	assert.equal(resolveEffectivePayer("NM Medicare Part B", "United", header, null), "United");
	assert.equal(resolveEffectivePayer("NM Medicare Part B", "Not Set", header, null), "NM Medicare Part B");
});

test("retains previous payer for blank primary and keeps invoice mapping separate", () => {
	assert.equal(resolveEffectivePayer("", "Not Set", header, primary), primary);
	setInvoiceItems({ [primary]: { item: "Configured invoice item" }, [header]: { item: "Different item" } });
	const resolved = resolveEffectivePayer(primary, "United", header, null);
	assert.equal(formatInvoiceItem(resolved, null), "Configured invoice item");
});
