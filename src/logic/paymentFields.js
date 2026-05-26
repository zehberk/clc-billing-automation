/**
 * @param {string} labelText
 */
export function getPaymentField(labelText) {
	const rows = document.querySelectorAll('#PaymentStaticView .responsiveformtablerow');
	for (const row of rows) {
		const label = row.querySelector('.form-label span')?.textContent?.trim();
		const value = row.querySelector('.form-input span')?.textContent?.trim();
		if (label === labelText) return value;
	}
	return null;
}
