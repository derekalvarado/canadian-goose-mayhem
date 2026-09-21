import { FloatingJoystick, type TouchCommand } from "./mobileControls";

interface TouchControlsOptions {
  onMove(command: TouchCommand): void;
  onHonk(): void;
  onInteract(): void;
  onWings(held: boolean): void;
  onAggressive(held: boolean): void;
  onTouchUsed(): void;
}

type HeldPose = "wings" | "aggressive";

/** DOM adapter for the reusable floating joystick and multitouch action buttons. */
export class TouchControls {
  private readonly joystick = new FloatingJoystick();
  private movementPointerId: number | null = null;
  private honkPointerId: number | null = null;
  private interactPointerId: number | null = null;
  private wingsPointerId: number | null = null;
  private aggressivePointerId: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly honk: HTMLButtonElement,
    private readonly interact: HTMLButtonElement,
    wings: HTMLButtonElement,
    aggressive: HTMLButtonElement,
    private readonly options: TouchControlsOptions,
  ) {
    root.addEventListener("pointerdown", this.onMovementStart);
    root.addEventListener("pointermove", this.onMovementMove);
    root.addEventListener("pointerup", this.onPointerEnd);
    root.addEventListener("pointercancel", this.onPointerEnd);
    root.addEventListener("lostpointercapture", this.onPointerEnd);
    honk.addEventListener("pointerdown", this.onHonkStart);
    honk.addEventListener("pointerup", this.onPointerEnd);
    honk.addEventListener("pointercancel", this.onPointerEnd);
    honk.addEventListener("lostpointercapture", this.onPointerEnd);
    interact.addEventListener("pointerdown", this.onInteractStart);
    interact.addEventListener("pointerup", this.onPointerEnd);
    interact.addEventListener("pointercancel", this.onPointerEnd);
    interact.addEventListener("lostpointercapture", this.onPointerEnd);
    wings.addEventListener("pointerdown", (event) => this.onPoseStart("wings", wings, event));
    wings.addEventListener("pointerup", this.onPointerEnd);
    wings.addEventListener("pointercancel", this.onPointerEnd);
    wings.addEventListener("lostpointercapture", this.onPointerEnd);
    aggressive.addEventListener("pointerdown", (event) => this.onPoseStart("aggressive", aggressive, event));
    aggressive.addEventListener("pointerup", this.onPointerEnd);
    aggressive.addEventListener("pointercancel", this.onPointerEnd);
    aggressive.addEventListener("lostpointercapture", this.onPointerEnd);
  }

  clear = (): void => {
    this.movementPointerId = null;
    this.honkPointerId = null;
    this.interactPointerId = null;
    this.wingsPointerId = null;
    this.aggressivePointerId = null;
    this.joystick.end();
    this.options.onMove({ moveX: 0, moveY: 0, hurry: false });
    this.options.onWings(false);
    this.options.onAggressive(false);
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

  private readonly onInteractStart = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || this.interactPointerId !== null) return;
    this.options.onTouchUsed();
    this.interactPointerId = event.pointerId;
    this.interact.setPointerCapture(event.pointerId);
    this.options.onInteract();
    event.preventDefault();
  };

  private onPoseStart(pose: HeldPose, button: HTMLButtonElement, event: PointerEvent): void {
    if (event.pointerType !== "touch") return;
    if (pose === "wings" ? this.wingsPointerId !== null : this.aggressivePointerId !== null) return;
    this.options.onTouchUsed();
    if (pose === "wings") this.wingsPointerId = event.pointerId;
    else this.aggressivePointerId = event.pointerId;
    button.setPointerCapture(event.pointerId);
    this.setPose(pose, true);
    event.preventDefault();
  }

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.movementPointerId) {
      this.movementPointerId = null;
      this.joystick.end();
      this.options.onMove({ moveX: 0, moveY: 0, hurry: false });
      this.stick.hidden = true;
    }
    if (event.pointerId === this.honkPointerId) this.honkPointerId = null;
    if (event.pointerId === this.interactPointerId) this.interactPointerId = null;
    if (event.pointerId === this.wingsPointerId) {
      this.wingsPointerId = null;
      this.setPose("wings", false);
    }
    if (event.pointerId === this.aggressivePointerId) {
      this.aggressivePointerId = null;
      this.setPose("aggressive", false);
    }
  };

  private setPose(pose: HeldPose, held: boolean): void {
    if (pose === "wings") this.options.onWings(held);
    else this.options.onAggressive(held);
  }

  private render(x: number, y: number): void {
    const command = this.joystick.update(x, y);
    const anchor = this.joystick.anchor;
    if (anchor) this.knob.style.transform = `translate(${x - anchor.x}px, ${y - anchor.y}px)`;
    this.options.onMove(command);
  }
}
