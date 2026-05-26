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
		<textarea id="paymentPaste" style="width:300px;height:80px;"></textarea><br>
		<button id="verifyPaymentsBtn" type="button" style="margin-top:6px;">Verify</button>
        <span id="verifyResult" style="margin-left:10px;"></span>
	`;

    // Style the button so it looks more like a button and not just text
    const btn = /** @type {HTMLButtonElement} */ (container.querySelector("#verifyPaymentsBtn"));
    btn.style.padding = "6px 12px";
    btn.style.border = "1px solid #666";
    btn.style.borderRadius = "4px";
    btn.style.background = "#ddd";
    btn.style.cursor = "pointer";
	btn.onclick = verifyPayments;

	targetNode.insertAdjacentElement("afterend", container);
    // enableRowTransitions();
}

function verifyPayments() {
	const pasted = getPastedValues();
	const pageValues = getEraPaymentsFromTable();

    // Clear previous state
	clearRowHighlights();
	const verifyBtn = document.getElementById("verifyPaymentsBtn");
	const box = verifyBtn?.parentElement;
	const resultSpan = document.getElementById("verifyResult");
	if (!box || !(resultSpan instanceof HTMLSpanElement)) return;
	resultSpan.textContent = "";
	box.style.background = "#eee";

	const result = compareLists(pasted, pageValues);

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
		resultSpan.textContent = "Pasted too many entries.";
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

/** @returns {number[]} */
function getPastedValues() {
	const textArea = /** @type {HTMLTextAreaElement} */ (
		document.getElementById("paymentPaste")
	);
	if (!textArea) return [];
	const text = textArea.value.trim();

	return text
		.split("\n")
		.map(v => parseMoney(v.trim()))
		.filter((v) => v !== undefined);
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
		const num = parseMoney(raw);

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
	/** @type {CompareIssue[]} */
	const issues = [];

	// If QB has too many entries, error out early (this part is fine)
	if (a.length > b.length) {
		return { match: false, type: "tooMany", indices: [] };
	}
    
	// Case: QB is missing entries
	if (a.length < b.length) {
		const missing = [];
		for (let i = a.length; i < b.length; i++) {
			missing.push(i);
		}
		issues.push({ type: "missing", indices: missing });
	}

	// Compare up to the shortest length
	const len = Math.min(a.length, b.length);
	const valueMismatches = [];

	for (let i = 0; i < len; i++) {
		if (a[i] !== b[i]) {
			valueMismatches.push(i);
		}
	}

	if (valueMismatches.length > 0) {
		issues.push({ type: "valueMismatch", indices: valueMismatches });
	}

	// If nothing went wrong:
	if (issues.length === 0) {
		return { match: true, type: "success", indices: [] };
	}

	// Otherwise return all issues
	return { match: false, type: "multiple", issues };
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
		const num = parseMoney(raw);
		
		return num !== undefined && num !== 0; // same rule as getEraPaymentsFromTable
	});
}
