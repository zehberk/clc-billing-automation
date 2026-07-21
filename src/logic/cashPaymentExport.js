import * as XLSX from "xlsx";
import {
	LAS_CRUCES_TAX_RATE,
	LAS_CRUCES_TAX_QB_CODE,
	taxRatesReady
} from "../data/constants.js";
import { calculateQboTaxableLine } from "./taxUtils.js";

const PRODUCT_SERVICE = "Cash and Credit Card Receipts";
/** @typedef {{ date: string, amount: number }} CashPayment */
const HEADERS = [
	"*InvoiceNo", "*Customer", "*InvoiceDate", "*DueDate", "Terms", "Memo",
	"Item(Product/Service)", "ItemDescription", "ItemQuantity", "ItemRate", "*ItemAmount",
	"Taxable", "TaxRate", "Shipping address", "Ship via", "Shipping date", "Tracking no",
	"Shipping Charge", "Service Date"
];

export function initCashPaymentExport() {
	if (window.top !== window || !isTherapyNotesPage() || !document.querySelector("#DivErasResults")) return;
	if (document.getElementById("clc-cash-import-btn")) return;

	const button = document.createElement("button");
	button.id = "clc-cash-import-btn";
	button.type = "button";
	button.textContent = "CC";
	Object.assign(button.style, floatingButtonStyle());
	button.addEventListener("click", showImportDialog);
	document.body?.appendChild(button);
}

function isTherapyNotesPage() {
	return /(^|\.)therapynotes\.com$/i.test(window.location.hostname);
}

function showImportDialog() {
	document.getElementById("clc-cash-import-dialog")?.remove();
	const overlay = document.createElement("div");
	overlay.id = "clc-cash-import-dialog";
	Object.assign(overlay.style, {
		position: "fixed", inset: "0", zIndex: "100001", display: "grid", placeItems: "center",
		background: "rgba(0,0,0,.42)", fontFamily: "ui-sans-serif, system-ui, sans-serif"
	});
	overlay.innerHTML = `
		<form style="width:min(520px,calc(100vw - 32px));background:#fff;padding:18px;border-radius:9px;box-shadow:0 12px 32px rgba(0,0,0,.3);color:#111">
			<button type="button" data-close style="float:right;cursor:pointer">Close</button>
			<h2 style="margin:0 0 14px;font-size:18px">Cash payment CSV</h2>
			<label data-drop style="display:grid;place-items:center;min-height:120px;padding:16px;border:2px dashed #7994a8;border-radius:7px;background:#f7fafc;cursor:pointer;text-align:center">
				<span><strong>Drop the monthly Excel list here</strong><br><small>or click to select an .xlsx, .xls, or .csv file</small></span>
				<input data-file type="file" accept=".xlsx,.xls,.csv" hidden>
			</label>
			<div data-file-name style="min-height:20px;margin:7px 0;color:#425466"></div>
			<label>First QBO invoice number<input data-number inputmode="numeric" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;padding:7px;margin-top:4px" placeholder="Example: 1001"></label>
			<div data-error style="min-height:20px;margin-top:8px;color:#b42318"></div>
			<button type="submit" style="padding:9px 13px;background:#1f84d1;color:#fff;border:1px solid #1b6aa8;border-radius:6px;font-weight:600;cursor:pointer">Create CSV</button>
		</form>`;

	const form = overlay.querySelector("form");
	const fileInput = /** @type {HTMLInputElement | null} */ (overlay.querySelector("input[data-file]"));
	const drop = /** @type {HTMLLabelElement | null} */ (overlay.querySelector("label[data-drop]"));
	const fileName = overlay.querySelector("div[data-file-name]");
	const error = overlay.querySelector("div[data-error]");
	const closeButton = overlay.querySelector("button[data-close]");
	const numberInput = /** @type {HTMLInputElement | null} */ (overlay.querySelector("input[data-number]"));
	if (!form || !fileInput || !drop || !fileName || !error || !closeButton || !numberInput) {
		throw new Error("Unable to create the cash payment import dialog.");
	}
	/** @type {File | null} */
	let selectedFile = null;

	/** @param {File | null | undefined} file */
	const selectFile = file => {
		selectedFile = file ?? null;
		fileName.textContent = selectedFile ? selectedFile.name : "";
		error.textContent = "";
	};
	fileInput.addEventListener("change", () => selectFile(fileInput.files?.[0]));
	drop.addEventListener("dragover", event => { event.preventDefault(); drop.style.background = "#e8f3fb"; });
	drop.addEventListener("dragleave", () => { drop.style.background = "#f7fafc"; });
	drop.addEventListener("drop", event => {
		event.preventDefault();
		drop.style.background = "#f7fafc";
		selectFile((/** @type {DragEvent} */ (event)).dataTransfer?.files?.[0]);
	});
	closeButton.addEventListener("click", () => overlay.remove());
	form.addEventListener("submit", async event => {
		event.preventDefault();
		const startingNumber = numberInput.value.trim();
		if (!selectedFile) return void (error.textContent = "Choose the monthly payment file.");
		if (!/^\d+$/.test(startingNumber)) return void (error.textContent = "Enter a numeric starting invoice number.");
		try {
			await taxRatesReady;
			const payments = parseCashPaymentWorkbook(await selectedFile.arrayBuffer());
			if (!LAS_CRUCES_TAX_RATE || !LAS_CRUCES_TAX_QB_CODE) {
				throw new Error("The Las Cruces tax rate or QB Code is unavailable. Refresh TherapyNotes and try again.");
			}
			downloadCsv(
				buildCashPaymentCsv(payments, startingNumber, LAS_CRUCES_TAX_RATE, LAS_CRUCES_TAX_QB_CODE),
				`qbo-cash-payments-${startingNumber}.csv`
			);
			fileName.textContent = `${payments.length} payment${payments.length === 1 ? "" : "s"} exported.`;
		} catch (caught) {
			error.textContent = caught instanceof Error ? caught.message : String(caught);
		}
	});
	document.body.appendChild(overlay);
}


/**
 * @param {ArrayBuffer | Uint8Array} arrayBuffer
 * @returns {CashPayment[]}
 */
export function parseCashPaymentWorkbook(arrayBuffer) {
	const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	if (!sheet) throw new Error("The workbook does not contain a worksheet.");
	const rows = /** @type {Record<string, unknown>[]} */ (
		XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true })
	);
	const payments = rows.flatMap((row, index) => {
		const dateValue = findColumn(row, "funding date");
		const totalValue = findColumn(row, "funding event total");
		if (dateValue == null && totalValue == null) return [];
		const amount = parseAmount(totalValue);
		if (!Number.isFinite(amount)) throw new Error(`Row ${index + 2} has an invalid Funding Event Total.`);
		const date = formatDate(dateValue);
		if (!date) throw new Error(`Row ${index + 2} has an invalid Funding Date.`);
		return [{ date, amount }];
	});
	if (!payments.length) throw new Error("No payments found. Expected Funding Date and Funding Event Total columns.");
	return payments;
}

/**
 * @param {CashPayment[]} payments
 * @param {string} startingNumber
 * @param {number} taxRate
 * @param {string} taxRateQbCode
 */
export function buildCashPaymentCsv(payments, startingNumber, taxRate, taxRateQbCode) {
	const first = BigInt(startingNumber);
	const width = startingNumber.length;
	const rows = [HEADERS];
	const orderedPayments = [...payments].sort((a, b) => getDateSortValue(a.date) - getDateSortValue(b.date));
	orderedPayments.forEach((payment, index) => {
		const net = calculateQboTaxableLine(payment.amount, taxRate);
		rows.push([
			(first + BigInt(index)).toString().padStart(width, "0"), "Therapy Notes", payment.date, payment.date,
			"Due Now", "", PRODUCT_SERVICE, "", "1", net.taxableAmount.toFixed(2),
			net.taxableAmount.toFixed(2), "Y", taxRateQbCode, "", "", "", "", "", ""
		]);
	});
	return rows.map(row => row.map(escapeCsv).join(",")).join("\r\n") + "\r\n";
}

/** @param {string} value */
function getDateSortValue(value) {
	const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!match) return Number.POSITIVE_INFINITY;
	return Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
}

/** @param {Record<string, unknown>} row @param {string} wanted */
function findColumn(row, wanted) {
	const key = Object.keys(row).find(name => name.trim().toLowerCase() === wanted);
	return key ? row[key] : null;
}

/** @param {unknown} value */
function parseAmount(value) {
	const amount = typeof value === "number"
		? value
		: Number(String(value ?? "").replace(/[$,\s]/g, ""));
	return Math.abs(Math.round(amount * 100) / 100);
}

/** @param {unknown} value */
function formatDate(value) {
	if (value instanceof Date && !Number.isNaN(value.valueOf())) {
		return formatQboDate(value.getMonth() + 1, value.getDate(), value.getFullYear());
	}
	const match = String(value ?? "").trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
	if (!match) return "";
	return formatQboDate(
		Number(match[1]),
		Number(match[2]),
		Number(match[3].length === 2 ? `20${match[3]}` : match[3])
	);
}

/** @param {number} month @param {number} day @param {number} year */
function formatQboDate(month, day, year) {
	if (month < 1 || month > 12 || day < 1 || day > 31 || !Number.isInteger(year)) return "";
	return `${month}/${day}/${year}`;
}

/** @param {unknown} value */
function escapeCsv(value) {
	const text = String(value ?? "");
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** @param {string} csv @param {string} fileName */
function downloadCsv(csv, fileName) {
	const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function floatingButtonStyle() {
	return {
		position: "fixed", right: "16px", bottom: "64px", zIndex: "99999", padding: "10px 12px",
		border: "1px solid #477126", background: "#5c8f32", color: "#fff", borderRadius: "6px",
		cursor: "pointer", fontWeight: "600"
	};
}
