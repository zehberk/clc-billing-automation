import test from "node:test";
import assert from "node:assert/strict";

import { calculateQboTaxableLine } from "../src/logic/taxUtils.js";

test("tax rounding is never negative or greater than one cent", () => {
	const taxRates = [0.01, 0.05, 0.0839, 0.1, 0.25];

	for (const taxRate of taxRates) {
		for (let grossCents = 1; grossCents <= 10000; grossCents += 1) {
			const result = calculateQboTaxableLine(grossCents / 100, taxRate);
			assert.ok(result.roundingAdjustment === 0 || result.roundingAdjustment === 0.01);
		}
	}
});
