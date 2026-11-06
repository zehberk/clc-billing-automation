import { PAYER_ALIASES, USE_SECONDARY_PAYER } from "../data/constants.js";
import { normalizePayerName } from "./invoiceUtils.js";

/**
 * Each row links one alias to a payer name. Repeat the payer name for
 * additional aliases; punctuation within a payer name is preserved.
 * @param {{ [key: string]: string | undefined }[]} rows
 */
export function parsePayerAliases(rows) {
	const aliases = new Map();
	for (const row of rows) {
		const payer = normalizePayerName(row["payer name"]);
		const alias = normalizePayerName(row["aliases"]);
		if (!payer || !alias) continue;
		aliases.set(payer, payer);
		aliases.set(alias, payer);
	}
	return aliases;
}

/** @param {string | null | undefined} name */
function payerIdentity(name) {
	const normalized = normalizePayerName(name);
	if (!normalized || normalized === "not set") return null;
	return PAYER_ALIASES.get(normalized) ?? normalized;
}

/**
 * Aliases identify payers only; return the original name so invoice item,
 * memo, and tax configuration remain independent of the alias table.
 * @param {string} primary
 * @param {string} secondary
 * @param {string | null} pageLevelPayer
 * @param {string | null} lastPayer
 */
export function resolveEffectivePayer(primary, secondary, pageLevelPayer, lastPayer) {
	const secondaryId = payerIdentity(secondary);
	const forceSecondary = [...USE_SECONDARY_PAYER].some(
		payer => normalizePayerName(payer) === normalizePayerName(primary)
	);
	if (forceSecondary && secondaryId) return secondary;

	const pageId = payerIdentity(pageLevelPayer);
	if (pageId && payerIdentity(primary) !== pageId && secondaryId === pageId) {
		return secondary;
	}
	return primary || lastPayer || "";
}
