import {
	TAX_RATES_CSV_URL,
	SF_THERAPISTS_URL,
	INVOICE_ITEMS_URL,
	setTaxRateVars,
	setInvoiceItems,
	setSantaFeTherapists,
	setLoadPromises,
	STORAGE_KEYS
} from "./constants.js";
import { getCache, setCache } from "./storage.js";

/** @typedef {{ [key: string]: string | undefined }} CsvRow */

// Promises for loading CSV data
/** @type {(value?: unknown) => void} */
let taxRatesLoaded = () => {};
/** @type {(value?: unknown) => void} */
let sfTherapistsLoaded = () => {};
/** @type {(value?: unknown) => void} */
let invoiceItemsLoaded = () => {};

const taxRatesReady = new Promise(resolve => taxRatesLoaded = resolve);
const sfTherapistsReady = new Promise(resolve => sfTherapistsLoaded = resolve);
const invoiceItemsReady = new Promise(resolve => invoiceItemsLoaded = resolve);

export const ALL_READY = Promise.all([
	// these three were registered via setLoadPromises() above
	taxRatesReady, 
	sfTherapistsReady, 
	invoiceItemsReady
]);

// Register into shared constant state
setLoadPromises(taxRatesReady, sfTherapistsReady, invoiceItemsReady);

loadCsvWithCache(TAX_RATES_CSV_URL, STORAGE_KEYS.TAX_RATES, (data) => {
	const result = { santaFe: 0, lasCruces: 0 };
	for (const row of data) {
		const location = row["city"]?.toLowerCase();
		const rate = parseFloat(row["tax rate (%)"] ?? "0") / 100;
		if (location === "santa fe") result.santaFe = rate;
		if (location === "las cruces") result.lasCruces = rate;
	}
	setTaxRateVars(result);
}, taxRatesLoaded);

loadCsvWithCache(SF_THERAPISTS_URL, STORAGE_KEYS.SF_THERAPISTS, (rows) => {
	const names = rows
		.map(r => r["therapist name"])
		.filter((name) => typeof name === "string");
	setSantaFeTherapists(names);
}, sfTherapistsLoaded);

loadCsvWithCache(INVOICE_ITEMS_URL, STORAGE_KEYS.INVOICE_ITEMS, (rows) => {
	/** @type {{ [payer: string]: { item: string, memo?: string, taxable?: boolean } }} */
	const parsed = {};
	for (const r of rows) {
		const payer = r["primary payer"];
		const item = r["invoice item"];
		const memo = r["check memo"];
		const taxable = parseBooleanFlag(r["taxable"]);
		if (payer && item) parsed[payer] = { item, memo, taxable };
	}
	setInvoiceItems(parsed);
}, invoiceItemsLoaded);

/** @param {string} line */
function parseCsvLine(line) {
	/** @type {string[]} */
	const cells = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		const next = line[i + 1];

		if (ch === '"') {
			if (inQuotes && next === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (ch === "," && !inQuotes) {
			cells.push(current.trim());
			current = "";
			continue;
		}

		current += ch;
	}

	cells.push(current.trim());
	return cells;
}

/**
 * @param {string} url
 * @param {string} cacheKey
 * @param {(rows: CsvRow[]) => void} parseFn
 * @param {() => void} resolveFn
 */
export async function loadCsvWithCache(url, cacheKey, parseFn, resolveFn) {
	/** @type {CsvRow[] | null} */
	const cached = getCache(cacheKey);
	if (cached) {
		parseFn(cached);
		resolveFn();
		return;
	}

	try {
		const res = await fetch(url);
		const text = await res.text();
		const lines = text.trim().split(/\r?\n/).filter(Boolean);
		const [rawHeaderLine, ...rawRowLines] = lines;
		const rawHeaders = parseCsvLine(rawHeaderLine);
		const headers = rawHeaders.map(h => h.trim().toLowerCase());
		/** @type {CsvRow[]} */
		const parsed = rawRowLines.map(line => {
			const cells = parseCsvLine(line);
			/** @type {CsvRow} */
			const rowObj = {};
			headers.forEach((h, i) => rowObj[h] = cells[i]?.trim());
			return rowObj;
		});
		setCache(cacheKey, parsed);
		parseFn(parsed);
	} catch (err) {
		console.error(`Failed to load ${cacheKey}:`, err);
	}
	resolveFn();
}

/**
 * @param {string | undefined} value
 */
function parseBooleanFlag(value) {
	if (!value) return false;
	return ["true", "yes", "y", "1", "x"].includes(value.trim().toLowerCase());
}
