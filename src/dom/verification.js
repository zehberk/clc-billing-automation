/**
 * @typedef {{ type: "missing" | "valueMismatch"; indices: number[] }} CompareIssue
 * @typedef {{ match: true; type: "success"; indices: number[] }} CompareSuccess
 * @typedef {{ match: false; type: "tooMany"; indices: number[] }} CompareTooMany
 * @typedef {{ match: false; type: "multiple"; issues: CompareIssue[] }} CompareMultiple
 * @typedef {CompareSuccess | CompareTooMany | CompareMultiple} CompareResult
 */

// export function enableRowTransitions() {
// 	const rows = document.querySelectorAll("#DivErasResults table tbody tr");
// 	rows.forEach(row => row.classList.add("qb-row-fade"));
// }

/** 
 * @param {HTMLElement} targetNode - The ERA results container you want to insert after.
 */
export function injectPaymentVerifier(targetNode) {
    const existing = document.querySelector("#DivPaymentVerification");
    if (existing) {
        existing.remove();
    }

	const container = document.createElement("div");
    container.id = "DivPaymentVerification";
	container.style.margin = "12px 0";
	container.style.padding = "8px";
	container.style.border = "1px solid #ccc";
	container.style.background = "#eee";
    container.style.transition = "background-color 0.66s ease";

	container.innerHTML = `
		<strong>Verify Payment Amounts</strong><br>
		<label id="paymentFileDrop" style="display:inline-block;margin-top:7px;padding:10px 14px;border:2px dashed #7994a8;border-radius:6px;background:#f7fafc;cursor:pointer;text-align:center;">
			<strong>Drop the QuickBooks payment report here</strong><br>
			<small>or click to select an .xlsx, .xls, or .csv file</small>
			<input id="paymentFileInput" type="file" accept=".xlsx,.xls,.csv" hidden>
		</label><br>
		<span id="paymentFileName" style="display:inline-block;min-height:18px;margin-top:4px;color:#425466;"></span><br>
		<span id="verifyResult"></span>
	`;

	const drop = /** @type {HTMLLabelElement | null} */ (container.querySelector("#paymentFileDrop"));
	const fileInput = /** @type {HTMLInputElement | null} */ (container.querySelector("#paymentFileInput"));
	if (drop && fileInput) {
		fileInput.addEventListener("change", () => importPaymentFile(fileInput.files?.[0]));
		drop.addEventListener("dragover", event => {
			event.preventDefault();
			drop.style.background = "#e8f3fb";
		});
		drop.addEventListener("dragleave", () => { drop.style.background = "#f7fafc"; });
		drop.addEventListener("drop", event => {
			event.preventDefault();
			drop.style.background = "#f7fafc";
			importPaymentFile((/** @type {DragEvent} */ (event)).dataTransfer?.files?.[0]);
		});
	}

	targetNode.insertAdjacentElement("afterend", container);
    // enableRowTransitions();
}

/** @param {File | null | undefined} file */
async function importPaymentFile(file) {
	if (!file) return;
	const fileName = document.getElementById("paymentFileName");
	const resultSpan = document.getElementById("verifyResult");
	try {
		const amounts = parsePaymentReportWorkbook(await file.arrayBuffer());
		if (fileName) fileName.textContent = `${file.name}: ${amounts.length} payments loaded.`;
		verifyPayments(amounts);
	} catch (caught) {
		if (fileName) fileName.textContent = file.name;
		if (resultSpan) {
			resultSpan.textContent = caught instanceof Error ? caught.message : String(caught);
			resultSpan.style.color = "red";
		}
	}
}

/**
 * @param {ArrayBuffer | Uint8Array} arrayBuffer
 * @returns {number[]}
 */
export function parsePaymentReportWorkbook(arrayBuffer) {
	const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	if (!sheet) throw new Error("The workbook does not contain a worksheet.");
	const rows = /** @type {unknown[][]} */ (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }));
	const headerIndex = rows.findIndex(row =>
		row.some(value => normalizeHeader(value) === "transaction type") &&
		row.some(value => normalizeHeader(value) === "amount")
	);
	if (headerIndex < 0) throw new Error("Could not find the Transaction type and Amount columns.");
	const header = rows[headerIndex];
	const typeColumn = header.findIndex(value => normalizeHeader(value) === "transaction type");
	const amountColumn = header.findIndex(value => normalizeHeader(value) === "amount");
	const amounts = [];
	for (let index = headerIndex + 1; index < rows.length; index += 1) {
		const row = rows[index];
		if (normalizeHeader(row[typeColumn]) !== "payment") continue;
		const cents = parseMoneyToCents(String(row[amountColumn] ?? ""));
		if (cents == null) throw new Error(`Payment row ${index + 1} has an invalid amount.`);
		if (cents !== 0) amounts.push(cents);
	}
	if (amounts.length === 0) throw new Error("No payment rows were found in the report.");
	return amounts;
}

/** @param {unknown} value */
function normalizeHeader(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** @param {number[]} importedPayments */
function verifyPayments(importedPayments) {
	const pageValues = getEraPaymentsFromTable();

    // Clear previous state
	clearRowHighlights();
	const box = document.getElementById("DivPaymentVerification");
	const resultSpan = document.getElementById("verifyResult");
	if (!box || !(resultSpan instanceof HTMLSpanElement)) return;
	resultSpan.textContent = "";
	box.style.background = "#eee";

	const result = compareLists(importedPayments, pageValues);

	if (result.match) {
		// SUCCESS STATE
		resultSpan.textContent = "Success";
		resultSpan.style.color = "green";

		// Subtle green background tint
		box.style.background = "#d6f5d6";
		return;
	}
    
	// FAILURE STATE
	// Light red background tint
	box.style.background = "#ffe0e0";
	resultSpan.style.color = "red";

	if (result.type == "tooMany") {
		resultSpan.textContent = "The imported report contains payments not found on this page.";
		return;
	}
	
	resultSpan.textContent = "Mismatch";

	// Highlight the problem rows
	result.issues.forEach(issue => highlightEraRows(issue.indices));
}

/**
 * @param {string} value
 * @returns {number | undefined}
 */
function parseMoney(value) {
	const cleaned = value.replace(/[^0-9.-]/g, "");
	const num = parseFloat(cleaned);

	return Number.isNaN(num) ? undefined : num;
}

/** @param {string} value @returns {number | undefined} */
function parseMoneyToCents(value) {
	const amount = parseMoney(value);
	return amount == null ? undefined : Math.round(amount * 100);
}

/** @returns {number[]} */
function getEraPaymentsFromTable() {
	const rows = document.querySelectorAll("#DivErasResults table tbody tr");

	/** @type {number[]} */
	const values = [];
	rows.forEach(row => {
        const payerCell = row.querySelector("td:nth-child(3)");
        if (!payerCell) return;
        
        const payer = (payerCell.textContent ?? "").trim().toUpperCase();
		if (payer.includes("PGBA")) return;

		const paymentCell = row.querySelector("td:nth-child(4)");
		if (!paymentCell) return;


		const raw = (paymentCell.textContent ?? "").trim();
		const num = parseMoneyToCents(raw);

		if (num === undefined || num === 0) return; // skip $0 entries

		values.push(num);
	});

	return values;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {CompareResult}
 */
function compareLists(a, b) {
	const available = new Map();
	for (const value of a) available.set(value, (available.get(value) ?? 0) + 1);
	const missing = [];
	for (let index = 0; index < b.length; index += 1) {
		const value = b[index];
		const count = available.get(value) ?? 0;
		if (count > 0) available.set(value, count - 1);
		else missing.push(index);
	}
	const extraCount = Array.from(available.values()).reduce((sum, count) => sum + count, 0);
	if (missing.length === 0 && extraCount === 0) {
		return { match: true, type: "success", indices: [] };
	}
	if (missing.length === 0) return { match: false, type: "tooMany", indices: [] };
	return { match: false, type: "multiple", issues: [{ type: "missing", indices: missing }] };
}

function clearRowHighlights() {
	const rows = /** @type {NodeListOf<HTMLTableRowElement>} */ (document.querySelectorAll("#DivErasResults table tbody tr"));
	rows.forEach(r => 
        r.classList.remove("qb-era-clicked-1", "qb-era-clicked-2", "qb-era-clicked-3", "qb-era-mismatch"));
}

/**
 * @param {number[]} indices
 */
function highlightEraRows(indices) {
	const rows = getFilteredRows();

	indices.forEach(i => {
		const row = /** @type {HTMLTableRowElement} */ (rows[i]);
		if (!row) return;
        row.classList.remove("qb-era-clicked-1", "qb-era-clicked-2", "qb-era-clicked-3", "qb-era-mismatch");
		row.classList.add("qb-era-mismatch", "qb-era-fade")
	});
}

/** @returns {HTMLTableRowElement[]} */
function getFilteredRows() {
	const rows = /** @type {NodeListOf<HTMLTableRowElement>} */ (
		document.querySelectorAll("#DivErasResults table tbody tr")
	);
	return Array.from(rows).filter((row) => {
        const payerCell = row.querySelector("td:nth-child(3)");
        if (!payerCell) return false;
        
        const payer = (payerCell.textContent ?? "").trim().toUpperCase();
		if (payer.includes("PGBA")) return false;
        
		const paymentCell = row.querySelector("td:nth-child(4)");
		if (!paymentCell) return false;

		const raw = (paymentCell.textContent ?? "").trim();
		const num = parseMoneyToCents(raw);
		
		return num !== undefined && num !== 0; // same rule as getEraPaymentsFromTable
	});
}
import * as XLSX from "xlsx";
