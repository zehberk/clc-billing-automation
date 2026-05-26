export function injectSharedStyles() {
	if (document.getElementById("QuickBooksStyles")) return;

	const style = document.createElement("style");
	style.id = "QuickBooksStyles";
	style.textContent = `
		.qb-summary-table, .qb-warning-table {
			border-collapse: collapse;
			width: 100%;
			margin-bottom: 20px;
			font-family: sans-serif;
			border-radius: 6px;
			overflow: hidden;
			box-shadow: 0 0 4px rgba(0, 0, 0, 0.05);
		}

		.qb-summary-table thead, .qb-warning-table thead {
			background-color: #d4edda;
		}

		.qb-summary-table th, .qb-summary-table td,
		.qb-warning-table th, .qb-warning-table td {
			padding: 8px;
			text-align: left;
		}

		.qb-summary-table td:last-child, .qb-summary-table td:nth-last-child(-n+3),
		.qb-summary-table th:last-child, .qb-summary-table th:nth-last-child(-n+3) {
			text-align: right;
		}

		.qb-warning-table {
			background-color: #fff8e1;
			box-shadow: 0 0 4px rgba(255, 193, 7, 0.15);
		}

		.qb-warning-table thead {
			background-color: #fff4cc;
		}
		
		
	`;
	document.head.appendChild(style);
}
