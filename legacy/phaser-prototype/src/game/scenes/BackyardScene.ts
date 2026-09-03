import Phaser from "phaser";

type ItemState = "onGround" | "carried" | "delivered";

export class BackyardScene extends Phaser.Scene {
  private goose?: Phaser.GameObjects.Container;
  private sandwich?: Phaser.GameObjects.Rectangle;
  private picnicBlanket?: Phaser.GameObjects.Rectangle;
  private goalZone?: Phaser.GameObjects.Zone;
  private goalMarker?: Phaser.GameObjects.Rectangle;
  private hintText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;
  private itemState: ItemState = "onGround";
  private speed = 220;
  private target?: Phaser.Math.Vector2;
  private readonly gooseRadius = 26;

  constructor() {
    super("backyard");
  }

  create(): void {
    this.scale.on("resize", this.layout, this);
    this.input.on("pointerdown", this.handlePointer, this);
    this.input.on("pointermove", this.handlePointer, this);

    this.drawWorld();
    this.layout();
  }

  update(): void {
    if (!this.goose || !this.target) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.goose.x, this.goose.y, this.target.x, this.target.y);

    if (distance < 10) {
      this.target = undefined;
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.goose.x, this.goose.y, this.target.x, this.target.y);
    const step = this.speed * this.game.loop.delta / 1000;

    this.goose.x += Math.cos(angle) * step;
    this.goose.y += Math.sin(angle) * step;

    this.keepGooseOnScreen();
    this.updateSandwichPosition();
    this.checkInteractions();
  }

  private drawWorld(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x9bdd7c);
    this.add.circle(width * 0.82, height * 0.18, Math.min(width, height) * 0.12, 0xfff1a8, 0.85);
    this.add.ellipse(width * 0.18, height * 0.22, width * 0.32, height * 0.1, 0xffffff, 0.45);
    this.add.ellipse(width * 0.35, height * 0.15, width * 0.28, height * 0.08, 0xffffff, 0.4);

    this.picnicBlanket = this.add.rectangle(width * 0.68, height * 0.62, 150, 110, 0xe86666);
    this.add.rectangle(width * 0.68, height * 0.62, 150, 10, 0xffffff, 0.9);
    this.add.rectangle(width * 0.68, height * 0.62, 10, 110, 0xffffff, 0.9);

    this.sandwich = this.add.rectangle(width * 0.68, height * 0.55, 38, 24, 0xf3d38b);
    this.add.rectangle(width * 0.68, height * 0.55, 38, 6, 0x78a83f);

    this.goalZone = this.add.zone(width * 0.16, height * 0.78, 150, 120);
    this.goalMarker = this.add.rectangle(width * 0.16, height * 0.78, 150, 120, 0xb6d0ff, 0.45)
      .setStrokeStyle(4, 0x3c78d8, 0.9);

    this.add.text(width * 0.16, height * 0.72, "Nest", {
      fontFamily: "Avenir Next, Trebuchet MS, sans-serif",
      fontSize: "24px",
      color: "#16324a"
    }).setOrigin(0.5);

    this.goose = this.add.container(width * 0.32, height * 0.62, [
      this.add.circle(0, 0, this.gooseRadius, 0xffffff),
      this.add.circle(18, -10, 15, 0xffffff),
      this.add.triangle(34, -10, 0, 8, 18, 0, 0, -8, 0xf5a623),
      this.add.circle(22, -14, 3, 0x111111)
    ]);

    this.hintText = this.add.text(width / 2, 22, "Tap anywhere to move the goose", {
      fontFamily: "Avenir Next, Trebuchet MS, sans-serif",
      fontSize: "22px",
      color: "#16324a",
      align: "center"
    }).setOrigin(0.5, 0);

    this.statusText = this.add.text(width / 2, 52, "Steal the sandwich and bring it back to the nest.", {
      fontFamily: "Avenir Next, Trebuchet MS, sans-serif",
      fontSize: "20px",
      color: "#16324a",
      align: "center"
    }).setOrigin(0.5, 0);
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    this.target = new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  private keepGooseOnScreen(): void {
    if (!this.goose) {
      return;
    }

    this.goose.x = Phaser.Math.Clamp(this.goose.x, this.gooseRadius, this.scale.width - this.gooseRadius);
    this.goose.y = Phaser.Math.Clamp(this.goose.y, this.gooseRadius, this.scale.height - this.gooseRadius);
  }

  private checkInteractions(): void {
    if (!this.goose || !this.sandwich || !this.goalZone || !this.statusText) {
      return;
    }

    if (
      this.itemState === "onGround" &&
      Phaser.Geom.Intersects.CircleToRectangle(
        new Phaser.Geom.Circle(this.goose.x, this.goose.y, this.gooseRadius),
        this.sandwich.getBounds()
      )
    ) {
      this.itemState = "carried";
      this.statusText.setText("Nice. Now hustle that sandwich back to the nest.");
    }

    if (
      this.itemState === "carried" &&
      Phaser.Geom.Rectangle.Contains(this.goalZone.getBounds(), this.goose.x, this.goose.y)
    ) {
      this.itemState = "delivered";
      this.target = undefined;
      this.statusText.setText("Mission complete. The goose wins snack custody.");
    }
  }

  private updateSandwichPosition(): void {
    if (!this.goose || !this.sandwich) {
      return;
    }

    if (this.itemState === "carried") {
      this.sandwich.x = this.goose.x + 24;
      this.sandwich.y = this.goose.y + 4;
    }
  }

  private layout(): void {
    const { width, height } = this.scale;

    if (this.hintText) {
      this.hintText.setPosition(width / 2, 18);
      this.hintText.setWordWrapWidth(Math.max(width - 40, 200));
    }

    if (this.statusText) {
      this.statusText.setPosition(width / 2, 48);
      this.statusText.setWordWrapWidth(Math.max(width - 50, 220));
    }

    if (this.goalZone) {
      this.goalZone.setPosition(width * 0.16, height * 0.78);
      this.goalZone.setSize(150, 120);
    }

    if (this.goalMarker) {
      this.goalMarker.setPosition(width * 0.16, height * 0.78);
    }

    if (this.picnicBlanket) {
      this.picnicBlanket.setPosition(width * 0.68, height * 0.62);
    }

    if (this.goose) {
      this.goose.setPosition(width * 0.32, height * 0.62);
    }

    if (this.itemState === "onGround" && this.sandwich) {
      this.sandwich.setPosition(width * 0.68, height * 0.55);
    }
  }
}
