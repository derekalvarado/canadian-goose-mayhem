import "./style.css";
import { Game } from "./game/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const loadingScreen = document.querySelector<HTMLElement>("#loading-screen");
const errorPanel = document.querySelector<HTMLElement>("#webgl-error");

if (!canvas || !loadingScreen || !errorPanel) {
  throw new Error("Game shell is incomplete.");
}

try {
  const game = new Game(canvas);
  game.start();
  requestAnimationFrame(() => loadingScreen.classList.add("loading-screen--hidden"));
} catch (error) {
  console.error(error);
  loadingScreen.hidden = true;
  errorPanel.hidden = false;
}
