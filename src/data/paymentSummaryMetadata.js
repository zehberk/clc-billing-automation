const paymentMethodsByTable = new WeakMap();

/** @param {HTMLTableElement} table @param {string[]} paymentMethods */
export function setPaymentSummaryMethods(table, paymentMethods) {
	paymentMethodsByTable.set(table, paymentMethods.slice());
}

/** @param {HTMLTableElement} table */
export function getPaymentSummaryMethods(table) {
	return paymentMethodsByTable.get(table) ?? [];
}
