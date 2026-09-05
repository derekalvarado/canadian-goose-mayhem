/** Browser audio output consumes gameplay events; it never decides gameplay. */
export class GameAudio {
  private context: AudioContext | undefined;
  private paused = false;
  private generation = 0;

  constructor() {
    window.addEventListener("keydown", this.unlock);
    window.addEventListener("pointerdown", this.unlock);
  }

  private readonly unlock = (): void => {
    if (this.paused || !window.AudioContext) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    } catch {
      // Unavailable audio must not prevent gameplay.
    }
  };

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.generation += 1;
    if (!this.context) return;
    const operation = paused ? this.context.suspend() : this.context.resume();
    void operation.catch(() => {});
  }

  async playHonk(): Promise<void> {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;

    try {
      const generation = this.generation;
      const context = this.context ??= new AudioContextClass();
      if (context.state === "suspended") await context.resume();
      if (this.paused || generation !== this.generation || context.state !== "running") return;
      const now = context.currentTime;
      const master = context.createGain();
      const resonator = context.createBiquadFilter();
      resonator.type = "bandpass";
      resonator.frequency.setValueAtTime(710, now);
      resonator.Q.setValueAtTime(2.4, now);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.16, now + 0.025);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      resonator.connect(master);
      master.connect(context.destination);

      [0, 1].forEach((index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 0 ? "sawtooth" : "triangle";
        oscillator.frequency.setValueAtTime(index === 0 ? 390 : 478, now);
        oscillator.frequency.exponentialRampToValueAtTime(index === 0 ? 305 : 360, now + 0.34);
        oscillator.detune.value = index === 0 ? -7 : 9;
        oscillator.connect(resonator);
        oscillator.onended = () => {
          oscillator.disconnect();
          if (index === 1) {
            resonator.disconnect();
            master.disconnect();
          }
        };
        oscillator.start(now + index * 0.012);
        oscillator.stop(now + 0.43);
      });
    } catch {
      // Audio can be blocked until a browser recognizes the input as a user gesture.
    }
  }
}
