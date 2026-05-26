/**
 * @param {string} key
 * @param {unknown} value
 */
export function setCache(key, value) {
	const now = new Date();
	const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	const ttlMs = tomorrow.getTime() - now.getTime();
	const item = {
		value,
		expiry: now.getTime() + ttlMs
	};
	localStorage.setItem(key, JSON.stringify(item));
}

/** @param {string} key */
export function getCache(key) {
	const cached = localStorage.getItem(key);
	if (!cached) return null;

	try {
		const item = JSON.parse(cached);
		if (Date.now() > item.expiry) {
			localStorage.removeItem(key);
			return null;
		}
		return item.value;

	} catch {
		localStorage.removeItem(key);
		return null;
	}
}
