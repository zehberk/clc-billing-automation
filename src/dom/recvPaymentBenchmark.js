import { runReceivePaymentExperiment } from "./recvPaymentExperiment.js";

const RECEIVE_PAYMENT_PATH = "/app/recvpayment";
const PANEL_ID = "clc-recvpayment-benchmark";
const SETTLE_DELAY_MS = 750;
const READY_TIMEOUT_MS = 30000;
const SETTLE_TIMEOUT_MS = 15000;

export function initReceivePaymentBenchmark() {
	if (window.top !== window) return;
	if (window.location.hostname !== "qbo.intuit.com") return;

	let lastBenchmarkedUrl = "";
	const checkRoute = () => {
		if (window.location.pathname !== RECEIVE_PAYMENT_PATH) return;
		if (window.location.href === lastBenchmarkedUrl) return;
		lastBenchmarkedUrl = window.location.href;
		startBenchmark();
	};

	checkRoute();
	window.addEventListener("popstate", checkRoute);
	window.addEventListener("hashchange", checkRoute);
	window.setInterval(checkRoute, 500);
}

function startBenchmark() {
	if (!document.body || document.getElementById(PANEL_ID)) return;

	const startedAt = performance.now();
	const domLoadedAt = getDomLoadedTime(startedAt);
	const panel = createPanel(domLoadedAt);
	document.body.appendChild(panel);
	let pendingStage = "screen";

	console.log("[CLC][Receive Payment Benchmark] DOM loaded", { milliseconds: domLoadedAt });
	waitForScreenReady()
		.then(() => {
			const screenReadyAt = performance.now();
			setMilestone("screen", "ready", screenReadyAt);
			pendingStage = "settled";
			console.log("[CLC][Receive Payment Benchmark] screen ready", { milliseconds: screenReadyAt });
			runReceivePaymentExperiment()
				.then(result => console.log("[CLC][Receive Payment Experiment] result", result))
				.catch(error => console.warn("[CLC][Receive Payment Experiment] failed", error));
			return waitForScreenToSettle();
		})
		.then(settledAt => {
			setMilestone("settled", "settled", settledAt);
			console.log("[CLC][Receive Payment Benchmark] screen settled", { milliseconds: settledAt });
		})
		.catch(error => {
			const target = document.querySelector(`[data-clc-stage="${pendingStage}"]`);
			if (target instanceof HTMLElement) {
				target.dataset.clcStage = "error";
				target.className = "clc-benchmark-error";
				target.textContent = error instanceof Error ? error.message : String(error);
			}
			console.warn("[CLC][Receive Payment Benchmark]", error);
		});
}

/**
 * @param {number} fallback
 * @returns {number}
 */
function getDomLoadedTime(fallback) {
	const navigation = performance.getEntriesByType("navigation")[0];
	if (navigation instanceof PerformanceNavigationTiming && navigation.domContentLoadedEventEnd > 0) {
		return navigation.domContentLoadedEventEnd;
	}
	return fallback;
}

function isReceivePaymentScreenReady() {
	const text = document.body?.innerText ?? "";
	const hasRecordSection = text.includes("Record or charge") || text.includes("Record payment");
	const hasTransactions = text.includes("Outstanding Transactions");
	const hasAmount = text.includes("Amount received") || text.includes("AMOUNT RECEIVED");
	return hasRecordSection && hasTransactions && hasAmount;
}

/** @returns {Promise<void>} */
function waitForScreenReady() {
	return new Promise((resolve, reject) => {
		if (isReceivePaymentScreenReady()) {
			resolve();
			return;
		}

		const observer = new MutationObserver(() => {
			if (!isReceivePaymentScreenReady()) return;
			observer.disconnect();
			clearTimeout(timeout);
			resolve();
		});
		observer.observe(document.body, { childList: true, subtree: true, characterData: true });

		const timeout = window.setTimeout(() => {
			observer.disconnect();
			reject(new Error(`Screen not ready after ${READY_TIMEOUT_MS / 1000}s`));
		}, READY_TIMEOUT_MS);
	});
}

/** @returns {Promise<number>} */
function waitForScreenToSettle() {
	return new Promise((resolve, reject) => {
		let settleTimer = 0;
		const finish = () => {
			observer.disconnect();
			clearTimeout(timeout);
			resolve(performance.now());
		};
		const schedule = () => {
			clearTimeout(settleTimer);
			settleTimer = window.setTimeout(finish, SETTLE_DELAY_MS);
		};
		const observer = new MutationObserver(mutations => {
			const externalMutation = mutations.some(mutation => {
				const target = mutation.target;
				return !(target instanceof Node) || !document.getElementById(PANEL_ID)?.contains(target);
			});
			if (externalMutation) schedule();
		});
		observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
		const timeout = window.setTimeout(() => {
			observer.disconnect();
			clearTimeout(settleTimer);
			reject(new Error(`Screen did not settle within ${SETTLE_TIMEOUT_MS / 1000}s`));
		}, SETTLE_TIMEOUT_MS);
		schedule();
	});
}

/**
 * @param {number} domLoadedAt
 * @returns {HTMLElement}
 */
function createPanel(domLoadedAt) {
	const panel = document.createElement("aside");
	panel.id = PANEL_ID;
	panel.innerHTML = `
		<div class="clc-benchmark-title">CLC page benchmark <button type="button" aria-label="Close">×</button></div>
		<div class="clc-benchmark-row"><span>DOM loaded</span><strong>${formatMs(domLoadedAt)}</strong></div>
		<div class="clc-benchmark-row"><span>Screen ready</span><strong data-clc-stage="screen">Waiting…</strong></div>
		<div class="clc-benchmark-row"><span>Screen settled</span><strong data-clc-stage="settled">Waiting…</strong></div>
		<div class="clc-benchmark-note">Settled = no QBO DOM changes for ${SETTLE_DELAY_MS} ms</div>
	`;
	Object.assign(panel.style, {
		position: "fixed", right: "16px", top: "16px", zIndex: "2147483647", width: "280px",
		padding: "12px", color: "#17233b", background: "#fff", border: "1px solid #8794a5",
		borderRadius: "6px", boxShadow: "0 6px 20px rgba(0,0,0,.22)", font: "13px/1.4 system-ui, sans-serif"
	});
	const style = document.createElement("style");
	style.textContent = `
		#${PANEL_ID} .clc-benchmark-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-weight:700; }
		#${PANEL_ID} button { padding:0 4px; border:0; background:transparent; cursor:pointer; font-size:20px; line-height:1; }
		#${PANEL_ID} .clc-benchmark-row { display:flex; justify-content:space-between; padding:5px 0; border-top:1px solid #e5e9ee; }
		#${PANEL_ID} .clc-benchmark-row strong { color:#08783e; }
		#${PANEL_ID} .clc-benchmark-error { color:#b42318 !important; text-align:right; }
		#${PANEL_ID} .clc-benchmark-note { margin-top:7px; color:#68778b; font-size:11px; }
	`;
	panel.appendChild(style);
	panel.querySelector("button")?.addEventListener("click", () => panel.remove());
	return panel;
}

/**
 * @param {string} stage
 * @param {string} status
 * @param {number} elapsed
 */
function setMilestone(stage, status, elapsed) {
	const element = document.querySelector(`[data-clc-stage="${stage}"]`);
	if (!(element instanceof HTMLElement)) return;
	element.dataset.clcStage = status;
	element.textContent = formatMs(elapsed);
}

/** @param {number} value */
function formatMs(value) {
	return `${Math.round(value).toLocaleString()} ms`;
}
