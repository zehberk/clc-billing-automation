/** @param {string} href */
export function normalizeHref(href) {
	return href.replace(window.location.origin, "");
}

/** @param {string} href */
export function isEraPaymentDetailHref(href) {
	try {
		const url = new URL(href, window.location.origin);
		const routeParams = new URLSearchParams(url.hash.replace(/^#/, ""));
		return routeParams.get("DisplayContext") === "PaymentStaticView";
	} catch {
		return false;
	}
}

/** @param {string} href */
export function getEraPayerByHref(href) {
	/** @type {{ [href: string]: string }} */
	const map = JSON.parse(localStorage.getItem("eraPayerMap") || "{}");
	return map[href];
}

/** @param {string} href @param {string} payerName */
export function setEraPayerByHref(href, payerName) {
	/** @type {{ [href: string]: string }} */
	const map = JSON.parse(localStorage.getItem("eraPayerMap") || "{}");
	map[href] = payerName;
	localStorage.setItem("eraPayerMap", JSON.stringify(map));
}
