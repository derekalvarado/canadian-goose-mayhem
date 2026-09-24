import { FloatingJoystick, type TouchCommand } from "./mobileControls";

interface TouchControlsOptions {
  onMove(command: TouchCommand): void;
  onHonk(): void;
  onInteract(): void;
  onWings(): void;
  onSneak(): void;
  onThreatening(held: boolean): void;
  onTouchUsed(): void;
}

type TogglePose = "wings" | "sneak";

/** DOM adapter for the reusable floating joystick and multitouch action buttons. */
export class TouchControls {
  private readonly joystick = new FloatingJoystick();
  private movementPointerId: number | null = null;
  private honkPointerId: number | null = null;
  private interactPointerId: number | null = null;
  private threatPointerId: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly honk: HTMLButtonElement,
    private readonly interact: HTMLButtonElement,
    private readonly wings: HTMLButtonElement,
    private readonly sneak: HTMLButtonElement,
    private readonly threat: HTMLButtonElement,
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
    wings.addEventListener("pointerdown", (event) => this.onPosePress("wings", event));
    sneak.addEventListener("pointerdown", (event) => this.onPosePress("sneak", event));
    threat.addEventListener("pointerdown", this.onThreatStart);
    threat.addEventListener("pointerup", this.onPointerEnd);
    threat.addEventListener("pointercancel", this.onPointerEnd);
    threat.addEventListener("lostpointercapture", this.onPointerEnd);
  }

  clear = (): void => {
    this.movementPointerId = null;
    this.honkPointerId = null;
    this.interactPointerId = null;
    this.threatPointerId = null;
    this.joystick.end();
    this.options.onMove({ moveX: 0, moveY: 0, hurry: false });
    this.options.onThreatening(false);
    this.stick.hidden = true;
  };

  syncPoseState(wingsSpread: boolean, sneaking: boolean, threatening: boolean): void {
    this.wings.setAttribute("aria-pressed", String(wingsSpread));
    this.sneak.setAttribute("aria-pressed", String(sneaking));
    this.threat.setAttribute("aria-pressed", String(threatening));
  }

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

  private readonly onThreatStart = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || this.threatPointerId !== null) return;
    this.options.onTouchUsed();
    this.threatPointerId = event.pointerId;
    this.threat.setPointerCapture(event.pointerId);
    this.options.onThreatening(true);
    event.preventDefault();
  };

  private onPosePress(pose: TogglePose, event: PointerEvent): void {
    if (event.pointerType !== "touch") return;
    this.options.onTouchUsed();
    this.togglePose(pose);
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
    if (event.pointerId === this.threatPointerId) {
      this.threatPointerId = null;
      this.options.onThreatening(false);
    }
  };

  private togglePose(pose: TogglePose): void {
    if (pose === "wings") this.options.onWings();
    else this.options.onSneak();
  }

  private render(x: number, y: number): void {
    const command = this.joystick.update(x, y);
    const anchor = this.joystick.anchor;
    if (anchor) this.knob.style.transform = `translate(${x - anchor.x}px, ${y - anchor.y}px)`;
    this.options.onMove(command);
  }
}
