import "./style.css";
import { Game } from "./game/Game";

function registerOfflineServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  watchForNewVersion();
  void navigator.serviceWorker.register(`${base}service-worker.js`, { scope: base, updateViaCache: "none" }).then((registration) => {
    // An installed app is often resumed rather than relaunched, so check again whenever it returns.
    void registration.update().catch(() => undefined);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
    });

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

// Reloading right after launch is invisible to the player; later on it would throw away
// their progress, so offer the update instead of forcing it.
const SILENT_UPDATE_WINDOW_MS = 15_000;

function watchForNewVersion(): void {
  let hadController = Boolean(navigator.serviceWorker.controller);
  let handled = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // The first install also takes control of the page, but that is not a new version.
    if (!hadController) {
      hadController = true;
      return;
    }
    if (handled) return;
    handled = true;
    if (performance.now() < SILENT_UPDATE_WINDOW_MS || document.visibilityState === "hidden") {
      location.reload();
      return;
    }
    const notice = document.createElement("button");
    notice.type = "button";
    notice.className = "update-notice";
    notice.textContent = "Update ready — tap to refresh";
    notice.addEventListener("click", () => location.reload());
    document.body.append(notice);
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
