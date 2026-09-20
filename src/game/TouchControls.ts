import { FloatingJoystick, type TouchCommand } from "./mobileControls";

interface TouchControlsOptions {
  onMove(command: TouchCommand): void;
  onHonk(): void;
  onTouchUsed(): void;
}

/** DOM adapter for the reusable floating joystick command producer. */
export class TouchControls {
  private readonly joystick = new FloatingJoystick();
  private movementPointerId: number | null = null;
  private honkPointerId: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly honk: HTMLButtonElement,
    private readonly options: TouchControlsOptions,
  ) {
    root.addEventListener("pointerdown", this.onMovementStart);
    root.addEventListener("pointermove", this.onMovementMove);
    root.addEventListener("pointerup", this.onPointerEnd);
    root.addEventListener("pointercancel", this.onPointerEnd);
    honk.addEventListener("pointerdown", this.onHonkStart);
    honk.addEventListener("pointerup", this.onPointerEnd);
    honk.addEventListener("pointercancel", this.onPointerEnd);
    honk.addEventListener("lostpointercapture", this.clear);
  }

  clear = (): void => {
    this.movementPointerId = null;
    this.honkPointerId = null;
    this.joystick.end();
    this.options.onMove({ moveX: 0, moveY: 0, hurry: false });
    this.stick.hidden = true;
  };

  private readonly onMovementStart = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || event.target !== this.root || this.movementPointerId !== null) return;
    this.options.onTouchUsed();
    this.movementPointerId = event.pointerId;
    this.root.setPointerCapture(event.pointerId);
    this.joystick.begin(event.clientX, event.clientY);
    this.stick.hidden = false;
    this.stick.style.left = `${event.clientX}px`;
    this.stick.style.top = `${event.clientY}px`;
    this.render(event.clientX, event.clientY);
    event.preventDefault();
  };

  private readonly onMovementMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.movementPointerId) return;
    this.render(event.clientX, event.clientY);
    event.preventDefault();
  };

  private readonly onHonkStart = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || this.honkPointerId !== null) return;
    this.options.onTouchUsed();
    this.honkPointerId = event.pointerId;
    this.honk.setPointerCapture(event.pointerId);
    this.options.onHonk();
    event.preventDefault();
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.movementPointerId) this.clear();
    if (event.pointerId === this.honkPointerId) this.honkPointerId = null;
  };

  private render(x: number, y: number): void {
    const command = this.joystick.update(x, y);
    const anchor = this.joystick.anchor;
    if (anchor) {
      this.knob.style.transform = `translate(${x - anchor.x}px, ${y - anchor.y}px)`;
    }
    this.options.onMove(command);
  }
}
