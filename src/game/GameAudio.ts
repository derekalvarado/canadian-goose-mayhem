const HONK_URL = "/audio/canada-goose-honk.mp3";

// 3 more recorded variants (pat2-4) sit alongside this one in
// public/audio/footsteps/ but are unused for now — pinned to a single
// variant while its timing/tone is still being evaluated. See
// assets/audio/README.md for source/license.
const FOOTSTEP_URL = "/audio/footsteps/goose-footstep-pat1.mp3";

/** Browser audio output consumes gameplay events; it never decides gameplay. */
export class GameAudio {
  private context: AudioContext | undefined;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
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
      void this.loadBuffer(this.context, HONK_URL).catch(() => {});
      void this.loadBuffer(this.context, FOOTSTEP_URL).catch(() => {});
    } catch {
      // Unavailable audio must not prevent gameplay.
    }
  };

  private loadBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Unable to load audio (${url}): ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data))
        .catch((error: unknown) => {
          this.buffers.delete(url);
          throw error;
        });
      this.buffers.set(url, buffer);
    }
    return buffer;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.generation += 1;
    if (!this.context) return;
    const operation = paused ? this.context.suspend() : this.context.resume();
    void operation.catch(() => {});
  }

  private async play(url: string, gainValue: number, playbackRate = 1): Promise<void> {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    try {
      const generation = this.generation;
      const context = this.context ??= new AudioContextClass();
      if (context.state === "suspended") await context.resume();
      const buffer = await this.loadBuffer(context, url);
      if (this.paused || generation !== this.generation || context.state !== "running") return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      gain.gain.value = gainValue;
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

  async playHonk(): Promise<void> {
    await this.play(HONK_URL, 0.72);
  }

  /** A light pitch wobble keeps the repeated cadence from sounding mechanical. */
  async playFootstep(): Promise<void> {
    await this.play(FOOTSTEP_URL, 0.4, 0.96 + Math.random() * 0.08);
  }
}
