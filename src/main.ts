import "./style.css";
import { Game } from "./game/Game";
import { encodeManualSignal, PAIRING_ANSWER_CHANNEL, signalFromUrl, storeAnswerFromUrl } from "./game/multiplayer/signaling.ts";

function registerOfflineServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  void navigator.serviceWorker.register(`${base}service-worker.js`, { scope: base }).then((registration) => {
    const warmOfflineCache = (): void => {
      const worker = navigator.serviceWorker.controller ?? registration.active;
      if (!worker) return;
      const urls = new Set<string>([base, `${base}index.html`, location.href]);
      for (const entry of performance.getEntriesByType("resource")) {
        if (entry.name.startsWith(location.origin)) urls.add(entry.name);
      }
      worker.postMessage({ type: "warm-cache", urls: [...urls] });
    };

    void navigator.serviceWorker.ready.then(warmOfflineCache);
    window.addEventListener("load", warmOfflineCache, { once: true });
    window.setTimeout(warmOfflineCache, 2000);
  }).catch((error: unknown) => {
    console.warn("Offline support could not be enabled.", error);
  });
}

registerOfflineServiceWorker();

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const loadingScreen = document.querySelector<HTMLElement>("#loading-screen");
const errorPanel = document.querySelector<HTMLElement>("#webgl-error");
const errorDetail = document.querySelector<HTMLElement>("#startup-error-detail");
const retryButton = document.querySelector<HTMLButtonElement>("#startup-retry");

if (!canvas || !loadingScreen || !errorPanel || !errorDetail || !retryButton) {
  throw new Error("Game shell is incomplete.");
}

let answerRelay = false;
try {
  const inbound = signalFromUrl(window.location.href);
  if (inbound?.mode === "answer") {
    answerRelay = true;
    let delivered = false;
    try { storeAnswerFromUrl(window.location.href); delivered = true; } catch { /* Broadcast may still reach the open host. */ }
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(PAIRING_ANSWER_CHANNEL);
      channel.postMessage(encodeManualSignal(inbound.signal));
      channel.close();
      delivered = true;
    }
    loadingScreen.hidden = true;
    const panel = document.querySelector<HTMLElement>("#pairing-delivered");
    if (panel) {
      panel.hidden = false;
      if (!delivered) panel.querySelector("span")!.textContent = "Automatic delivery was blocked. Copy this page's address, return to the open host game, and paste it there.";
    }
    document.querySelector<HTMLButtonElement>("#pairing-delivered-close")?.addEventListener("click", () => window.close());
  }

  if (answerRelay) {
    // The original host tab owns the non-serializable RTCPeerConnection. This
    // lightweight landing route hands it the response instead of starting a
    // second 3D game.
  } else if (new URLSearchParams(location.search).has("animation")) {
    void import("./game/GoosePreview").then(({ startGoosePreview }) => startGoosePreview(canvas)).catch((error: unknown) => {
      console.error(error);
      loadingScreen.hidden = true;
      errorDetail.textContent = error instanceof Error ? error.message : "Animation preview failed.";
      errorPanel.hidden = false;
    });
  } else {
    const game = new Game(canvas);
    game.start();
    requestAnimationFrame(() => loadingScreen.classList.add("loading-screen--hidden"));
  }
} catch (error) {
  console.error(error);
  loadingScreen.hidden = true;
  errorDetail.textContent = error instanceof Error
    ? `Startup error: ${error.message}`
    : "An unknown startup error occurred.";
  errorPanel.hidden = false;
}

retryButton.addEventListener("click", () => window.location.reload());
