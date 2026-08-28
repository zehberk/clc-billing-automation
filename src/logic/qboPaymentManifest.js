import { shouldContinueInvoice } from "./invoiceGrouping.js";

/**
 * Builds the cross-browser reference data used to receive payments in QBO.
 * One TherapyNotes ERA is one payment, and invoiceSelections explicitly lists
 * every QBO invoice that must be selected for that payment.
 *
 * @param {{ eraNumber?: string, invoiceDate?: string, eraIndex?: number, isInvoiceContinuation?: boolean, totalAllocation: string, checkMemo: string, paymentMethod: string }[]} rows
 * @param {string} startingInvoiceNumber
 */
export function createQboPaymentManifest(rows, startingInvoiceNumber) {
	const firstNumber = BigInt(startingInvoiceNumber);
	const numberWidth = startingInvoiceNumber.length;
	const invoices = [];
	let currentInvoice;

	for (const row of rows) {
		if (!shouldContinueInvoice(row) || !currentInvoice) {
			currentInvoice = {
				invoiceNumber: (firstNumber + BigInt(invoices.length)).toString().padStart(numberWidth, "0"),
				eraNumber: row.eraNumber ?? "",
				invoiceDate: row.invoiceDate ?? "",
				sourceEraIndex: row.eraIndex ?? 0,
				paymentType: row.paymentMethod ?? "",
				paymentMemo: row.checkMemo ?? "",
				amountCents: 0,
				lineCount: 0
			};
			invoices.push(currentInvoice);
		}
		currentInvoice.amountCents += parseMoneyToCents(row.totalAllocation);
		currentInvoice.lineCount += 1;
	}

	const paymentsByEra = new Map();
	for (const invoice of invoices) {
		const key = `${invoice.sourceEraIndex}:${invoice.eraNumber}`;
		let payment = paymentsByEra.get(key);
		if (!payment) {
			payment = {
				paymentReference: invoice.eraNumber,
				paymentDate: invoice.invoiceDate,
				sourceEraIndex: invoice.sourceEraIndex,
				paymentType: invoice.paymentType,
				paymentMemo: invoice.paymentMemo,
				paymentAmountCents: 0,
				invoiceSelections: [],
				mappedPaymentTypes: [],
				mappedPaymentMemos: []
			};
			paymentsByEra.set(key, payment);
		}
		payment.paymentAmountCents += invoice.amountCents;
		payment.invoiceSelections.push({
			invoiceNumber: invoice.invoiceNumber,
			amount: formatCents(invoice.amountCents)
		});
		addUnique(payment.mappedPaymentTypes, invoice.paymentType);
		addUnique(payment.mappedPaymentMemos, invoice.paymentMemo);
	}

	const payments = Array.from(paymentsByEra.values()).map(payment => ({
		paymentReference: payment.paymentReference,
		paymentDate: payment.paymentDate,
		sourceEraIndex: payment.sourceEraIndex,
		paymentType: hasOneDefinedValue(payment.mappedPaymentTypes) ? payment.mappedPaymentTypes[0] : "",
		paymentMemo: hasOneDefinedValue(payment.mappedPaymentMemos) ? payment.mappedPaymentMemos[0] : "",
		paymentAmount: formatCents(payment.paymentAmountCents),
		invoiceSelections: payment.invoiceSelections,
		isSplitAcrossInvoices: payment.invoiceSelections.length > 1,
		requiresReview: !hasOneDefinedValue(payment.mappedPaymentTypes) || !hasOneDefinedValue(payment.mappedPaymentMemos),
		...(!hasOneDefinedValue(payment.mappedPaymentTypes) ? { mappedPaymentTypes: payment.mappedPaymentTypes } : {}),
		...(!hasOneDefinedValue(payment.mappedPaymentMemos) ? { mappedPaymentMemos: payment.mappedPaymentMemos } : {})
	}));

	return {
		invoices: invoices.map(({ amountCents, paymentType, paymentMemo, ...invoice }) => ({
			...invoice,
			amount: formatCents(amountCents)
		})),
		payments
	};
}

/** @param {string} value */
function parseMoneyToCents(value) {
	const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
	const amount = Number(normalized);
	return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/** @param {number} cents */
function formatCents(cents) {
	return (cents / 100).toFixed(2);
}

/** @param {string[]} values @param {string} value */
function addUnique(values, value) {
	if (!values.includes(value)) values.push(value);
}

/** @param {string[]} values */
function hasOneDefinedValue(values) {
	return values.length === 1 && values[0].trim() !== "" && !values[0].includes("Please Verify");
}
