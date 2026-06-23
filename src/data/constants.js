/** @typedef {{ item: string, memo?: string, taxable?: boolean }} InvoiceItemData */
/** @typedef {{ [payer: string]: InvoiceItemData }} InvoiceItemMap */

export const TAX_RATES_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTo8ZU3kY9uHNfBLhuMJdLMeRnBUoeqQeAOTL9BoDYRRYV2JGUfSELgVm3-P6JKDrelWTybLMu_Uzmq/pub?gid=0&single=true&output=csv";
export const SF_THERAPISTS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTo8ZU3kY9uHNfBLhuMJdLMeRnBUoeqQeAOTL9BoDYRRYV2JGUfSELgVm3-P6JKDrelWTybLMu_Uzmq/pub?gid=2094160848&single=true&output=csv";
export const INVOICE_ITEMS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTo8ZU3kY9uHNfBLhuMJdLMeRnBUoeqQeAOTL9BoDYRRYV2JGUfSELgVm3-P6JKDrelWTybLMu_Uzmq/pub?gid=1880971213&single=true&output=csv";

export const EXCLUDED_PAYERS = new Set(["PGBA,LLC", "Carelon Behavioral Health, Inc."]);

export const USE_SECONDARY_PAYER = new Set([
	"NM Medicare Part B J4 ATTN: CLAIMS",
	"NM Medicare Part B"
]);

export const MEDICARE_OVERRIDE_PAYERS = [
	"NOVITAS SOLUTIONS, INC."
];

export const GEHA_OVERRIDE_PAYERS = [
    "GOVERNMENT EMPLOYEES HEALTH ASSOCIATION",
	"Government Employees Health AssociationInc. (GEHA)"
];

// These get populated by init functions
/** @type {Promise<void>} */
export let taxRatesReady;
/** @type {Promise<void>} */
export let sfTherapistsReady;
/** @type {Promise<void>} */
export let invoiceItemsReady;
export let LAS_CRUCES_TAX_RATE = 0.00;
export let SANTA_FE_TAX_RATE = 0.00;
/** @type {InvoiceItemMap} */
export let PAYER_TO_INVOICE_ITEM_DATA = {};
/** @type {{ [href: string]: string }} */
export const therapistNameCache = {};

export const STORAGE_KEYS = {
	INVOICE_ITEMS: "invoiceItems",
	SF_THERAPISTS: "sfTherapists",
	TAX_RATES: "taxRates"
};

// Export updaters
/** @param {{ lasCruces: number, santaFe: number }} param0 */
export function setTaxRateVars({ lasCruces, santaFe }) {
	LAS_CRUCES_TAX_RATE = lasCruces;
	SANTA_FE_TAX_RATE = santaFe;
}
/** @param {InvoiceItemMap} data */
export function setInvoiceItems(data) {
	PAYER_TO_INVOICE_ITEM_DATA = data;
}

/** @type {string[]} */
export let SANTA_FE_THERAPISTS = [];
/** @param {string[]} list */
export function setSantaFeTherapists(list) {
	SANTA_FE_THERAPISTS = list;
}

/**
 * @param {Promise<void>} tax
 * @param {Promise<void>} sf
 * @param {Promise<void>} invoice
 */
export function setLoadPromises(tax, sf, invoice) {
	taxRatesReady = tax;
	sfTherapistsReady = sf;
	invoiceItemsReady = invoice;
}

let USE_MEDICARE_OVERRIDE = false;
/** @param {boolean} flag */
export function setUseMedicareOverride(flag) {
	USE_MEDICARE_OVERRIDE = flag;
}

export function getUseMedicareOverride() {
	return USE_MEDICARE_OVERRIDE;
}
let USE_GEHA_OVERRIDE = false;
/** @param {boolean} flag */
export function setUseGehaOverride(flag) {
	USE_GEHA_OVERRIDE = flag;
}

export function getUseGehaOverride() {
	return USE_GEHA_OVERRIDE;
}
