import test from "node:test";
import assert from "node:assert/strict";

import { shouldContinueInvoice } from "../src/logic/invoiceGrouping.js";
import { createQboPaymentManifest } from "../src/logic/qboPaymentManifest.js";

test("continues an invoice only for a flagged one-cent rounding row", () => {
	assert.equal(shouldContinueInvoice({
		isTaxRounding: true,
		isInvoiceContinuation: true,
		totalAllocation: "$0.01"
	}), true);
});

test("rejects negative rounding rows", () => {
	assert.equal(shouldContinueInvoice({
		isTaxRounding: true,
		isInvoiceContinuation: true,
		totalAllocation: "($0.01)"
	}), false);
});

test("rejects genuine and oversized rows even when marked as continuations", () => {
	assert.equal(shouldContinueInvoice({
		isInvoiceContinuation: true,
		totalAllocation: "$161.20"
	}), false);
	assert.equal(shouldContinueInvoice({
		isTaxRounding: true,
		isInvoiceContinuation: true,
		totalAllocation: "$161.20"
	}), false);
});

test("manifest splits a genuine allocation into a separate invoice", () => {
	const common = {
		eraNumber: "ERA-1",
		invoiceDate: "8/28/2026",
		eraIndex: 0,
		checkMemo: "PRESBYTERIAN",
		paymentMethod: "EFT"
	};
	const result = createQboPaymentManifest([
		{ ...common, totalAllocation: "$3,239.54" },
		{ ...common, totalAllocation: "$161.20", isInvoiceContinuation: true }
	], "1000");

	assert.deepEqual(result.invoices.map(invoice => invoice.invoiceNumber), ["1000", "1001"]);
	assert.deepEqual(result.payments[0].invoiceSelections, [
		{ invoiceNumber: "1000", amount: "3239.54" },
		{ invoiceNumber: "1001", amount: "161.20" }
	]);
});
