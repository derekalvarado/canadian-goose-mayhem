const HONK_URL = "/audio/canada-goose-honk.mp3";

/** Browser audio output consumes gameplay events; it never decides gameplay. */
export class GameAudio {
  private context: AudioContext | undefined;
  private honkBuffer: Promise<AudioBuffer> | undefined;
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
      void this.loadHonk(this.context).catch(() => {});
    } catch {
      // Unavailable audio must not prevent gameplay.
    }
  };

  private loadHonk(context: AudioContext): Promise<AudioBuffer> {
    this.honkBuffer ??= fetch(HONK_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load goose honk: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .catch((error: unknown) => {
        this.honkBuffer = undefined;
        throw error;
      });
    return this.honkBuffer;
  }

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
      const buffer = await this.loadHonk(context);
      if (this.paused || generation !== this.generation || context.state !== "running") return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.72;
      source.connect(gain);
      gain.connect(context.destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    } catch {
      // Loading or browser autoplay policy failures must not prevent gameplay.
    }
  }
}
