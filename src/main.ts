import "./style.css";
import { Game } from "./game/Game";

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

try {
  if (new URLSearchParams(location.search).has("animation")) {
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
