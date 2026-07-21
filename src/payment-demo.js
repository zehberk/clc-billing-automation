import "./payment-demo.css";

const STORAGE_KEY = "clc-payment-demo-progress-v1";

// Invoice numbers and amounts come from qbo-invoices-67203 (2).csv.
// Grouping, methods, memos, and ERA numbers are intentionally dummy demo data.
/** @type {{ era: string, invoices: string[], amount: number, date: string, method: string, memo: string }[]} */
const payments = [
	{ era: "DEMO-ERA-1001", invoices: ["67203", "67204"], amount: 801.54, date: "07/11/2026", method: "EFT", memo: "MEDICARE" },
	{ era: "DEMO-ERA-1002", invoices: ["67205"], amount: 230.73, date: "07/11/2026", method: "EFT", memo: "HUMANA" },
	{ era: "DEMO-ERA-1003", invoices: ["67206"], amount: 24.57, date: "07/11/2026", method: "Check", memo: "CHK-80421" },
	{ era: "DEMO-ERA-1004", invoices: ["67207"], amount: 186.85, date: "07/11/2026", method: "EFT", memo: "UHC" },
	{ era: "DEMO-ERA-1005", invoices: ["67208"], amount: 231.69, date: "07/11/2026", method: "EFT", memo: "CENTENNIAL" },
	{ era: "DEMO-ERA-1006", invoices: ["67209"], amount: 390.95, date: "07/11/2026", method: "EFT", memo: "TRIWEST" },
	{ era: "DEMO-ERA-1007", invoices: ["67210", "67211"], amount: 2331.30, date: "07/11/2026", method: "EFT", memo: "PRESBYTERIAN" }
];

let state = readState();
const appElement = document.querySelector("#app");
if (!(appElement instanceof HTMLElement)) throw new Error("Payment demo app container was not found.");
/** @type {HTMLElement} */
const app = appElement;

function readState() {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
		if (saved && Number.isInteger(saved.index) && Array.isArray(saved.completed)) return saved;
	} catch {}
	return { index: 0, completed: [], flagged: [] };
}

function saveState() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** @param {number} value */
function money(value) {
	return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** @param {string} label @param {string} value */
function copyButton(label, value) {
	return `<button class="copy" type="button" data-copy="${value}" aria-label="Copy ${label}">Copy</button>`;
}

function render() {
	const payment = payments[state.index];
	const done = state.completed.includes(state.index);
	const flagged = state.flagged.includes(state.index);
	const multiple = payment.invoices.length > 1;
	app.innerHTML = `
		<header>
			<div class="eyebrow">CLC BILLING AUTOMATION · DEMO</div>
			<h1>Receive Payments</h1>
			<div class="progress"><span style="width:${((state.index + 1) / payments.length) * 100}%"></span></div>
			<p>Payment ${state.index + 1} of ${payments.length} · ${state.completed.length} completed</p>
		</header>
		${multiple ? `<section class="warning"><strong>Select multiple invoices</strong><span>This payment belongs to ${payment.invoices.length} QBO invoices. Select every invoice shown below before recording.</span></section>` : ""}
		<section class="card">
			<div class="era"><span>Source ERA</span><strong>${payment.era}</strong></div>
			<div class="field invoice-field">
				<span>Invoice${multiple ? "s" : ""}</span>
				<div class="invoice-list">${payment.invoices.map(number => `<strong>${number}</strong>${copyButton("invoice", number)}`).join("")}</div>
			</div>
			<div class="field"><span>Amount received</span><strong>${money(payment.amount)}</strong>${copyButton("amount", payment.amount.toFixed(2))}</div>
			<div class="field"><span>Payment date</span><strong>${payment.date}</strong>${copyButton("date", payment.date)}</div>
			<div class="field"><span>Payment method</span><strong>${payment.method}</strong>${copyButton("method", payment.method)}</div>
			<div class="field"><span>Memo / reference</span><strong>${payment.memo}</strong>${copyButton("memo", payment.memo)}</div>
		</section>
		<p class="hint">Find the invoice in QBO, select all listed invoices, enter these values, then record the payment manually.</p>
		<div class="status ${done ? "done" : flagged ? "flagged" : ""}">${done ? "Completed" : flagged ? "Flagged for review" : "Not yet completed"}</div>
		<nav>
			<button type="button" data-action="previous" ${state.index === 0 ? "disabled" : ""}>Previous</button>
			<button type="button" class="flag" data-action="flag">${flagged ? "Unflag" : "Flag problem"}</button>
			<button type="button" class="primary" data-action="complete">${done ? "Next" : "Complete & next"}</button>
		</nav>
		<footer><button type="button" data-action="reset">Reset demo</button><span>Methods, memos, ERA grouping are dummy data.</span></footer>
	`;
}

app.addEventListener("click", async event => {
	if (!(event.target instanceof Element)) return;
	const button = event.target.closest("button");
	if (!button) return;
	if (button.dataset.copy) {
		await navigator.clipboard.writeText(button.dataset.copy);
		const original = button.textContent;
		button.textContent = "Copied";
		setTimeout(() => { button.textContent = original; }, 900);
		return;
	}
	const action = button.dataset.action;
	if (action === "previous") state.index = Math.max(0, state.index - 1);
	if (action === "complete") {
		if (!state.completed.includes(state.index)) state.completed.push(state.index);
		if (state.index < payments.length - 1) state.index += 1;
	}
	if (action === "flag") {
		state.flagged = state.flagged || [];
		state.flagged = state.flagged.includes(state.index)
			? state.flagged.filter(/** @param {number} index */ index => index !== state.index)
			: [...state.flagged, state.index];
	}
	if (action === "reset") state = { index: 0, completed: [], flagged: [] };
	saveState();
	render();
});

render();
