import "./style.css";
import { Game } from "./game/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const loadingScreen = document.querySelector<HTMLElement>("#loading-screen");
const errorPanel = document.querySelector<HTMLElement>("#webgl-error");
const errorDetail = document.querySelector<HTMLElement>("#startup-error-detail");
const retryButton = document.querySelector<HTMLButtonElement>("#startup-retry");

if (!canvas || !loadingScreen || !errorPanel || !errorDetail || !retryButton) {
  throw new Error("Game shell is incomplete.");
}

try {
  const game = new Game(canvas);
  game.start();
  requestAnimationFrame(() => loadingScreen.classList.add("loading-screen--hidden"));
} catch (error) {
  console.error(error);
  loadingScreen.hidden = true;
  errorDetail.textContent = error instanceof Error
    ? `Startup error: ${error.message}`
    : "An unknown startup error occurred.";
  errorPanel.hidden = false;
}

retryButton.addEventListener("click", () => window.location.reload());
