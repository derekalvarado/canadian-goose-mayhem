import Phaser from "phaser";
import { BackyardScene } from "./scenes/BackyardScene";

export function createGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#87d3f5",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: window.innerWidth,
      height: window.innerHeight
    },
    scene: [BackyardScene],
    physics: {
      default: "arcade",
      arcade: {
        debug: false
      }
    }
  });
}
