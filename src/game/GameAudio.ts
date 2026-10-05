const HONK_URL = `${import.meta.env.BASE_URL}audio/canada-goose-honk.mp3`;

// 3 more recorded variants (pat2-4) sit alongside this one in
// public/audio/footsteps/ but are unused for now — pinned to a single
// variant while its timing/tone is still being evaluated. See
// assets/audio/README.md for source/license.
const FOOTSTEP_URL = `${import.meta.env.BASE_URL}audio/footsteps/goose-footstep-pat1.mp3`;

// A seamless loop of wood dragged on concrete (WAV so it loops without a gap).
// See assets/audio/README.md for source/license.
const GUITAR_DRAG_URL = `${import.meta.env.BASE_URL}audio/guitar/guitar-drag-loop.wav`;
/** How loud the guitar scrape plays at full drag speed, right beside the listening goose. */
const SCRAPE_LEVEL = 0.085;

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
      void this.loadBuffer(this.context, GUITAR_DRAG_URL).then((buffer) => { this.dragBuffer = buffer; }).catch(() => {});
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

  /** Two rising bell tones when a task is crossed off; synthesized, so no file to load. */
  playTaskComplete(): void {
    this.tones([[784, 0, 0.5], [1175, 0.13, 0.8]], 0.16, "triangle");
  }

  /** A bright counter-bell ding. */
  playBell(): void {
    this.tones([[1568, 0, 1.1], [2350, 0, 0.6], [3136, 0, 0.35]], 0.09, "sine");
  }

  /** A short "order up" pair of notes when the barista calls out an order. */
  playOrderCalled(): void {
    this.tones([[659, 0, 0.25], [523, 0.16, 0.35]], 0.07, "sine");
  }

  /** Two quick yaps from the small white dog; quieter the further away it is (`loudness` 0–1). */
  playDogBark(loudness = 1): void {
    const context = this.runningContext(); if (!context) return;
    const now = context.currentTime;
    for (const [start, pitch] of [[0, 1], [0.17, 1.12]] as const) {
      const oscillator = context.createOscillator(); const filter = context.createBiquadFilter(); const gain = context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(820 * pitch, now + start);
      oscillator.frequency.exponentialRampToValueAtTime(430 * pitch, now + start + 0.09);
      filter.type = "bandpass"; filter.frequency.value = 1300; filter.Q.value = 1.4;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.11 * loudness, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.11);
      oscillator.connect(filter); filter.connect(gain); gain.connect(context.destination);
      oscillator.start(now + start); oscillator.stop(now + start + 0.14);
      oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
    }
  }

  private tones(notes: readonly (readonly [frequency: number, start: number, length: number])[], volume: number, type: OscillatorType): void {
    const context = this.runningContext(); if (!context) return;
    const now = context.currentTime;
    for (const [frequency, start, length] of notes) this.note(context, context.destination, frequency, now + start, length, volume, type);
  }

  private runningContext(): AudioContext | undefined {
    if (this.paused || !this.context || this.context.state !== "running") return undefined;
    return this.context;
  }

  private note(context: AudioContext, output: AudioNode, frequency: number, at: number, length: number, volume: number, type: OscillatorType): void {
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain); gain.connect(output);
    oscillator.start(at); oscillator.stop(at + length + 0.05);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private music?: { gain: GainNode; timer: number; nextBeat: number; beat: number };

  /**
   * The café radio: a soft, looping electric-piano tune synthesized on the fly.
   * Presentation follows the radio's on/off state; it never changes gameplay.
   */
  setCafeMusic(playing: boolean): void {
    if (!playing) {
      if (!this.music) return;
      const { gain, timer } = this.music; this.music = undefined;
      window.clearInterval(timer);
      const context = this.context;
      if (context) { gain.gain.setTargetAtTime(0, context.currentTime, 0.08); window.setTimeout(() => gain.disconnect(), 600); }
      return;
    }
    const context = this.runningContext();
    if (this.music || !context) return;
    const gain = context.createGain(); gain.gain.value = 0; gain.connect(context.destination);
    gain.gain.setTargetAtTime(1, context.currentTime, 0.4);
    const music = { gain, timer: 0, nextBeat: context.currentTime + 0.1, beat: 0 };
    const beatSeconds = 60 / 84;
    // Dmaj7 – Bm7 – Em7 – A7, two beats each, with a lazy pentatonic tune over the top.
    const chords = [[146.8, 185, 220, 277.2], [123.5, 146.8, 185, 220], [164.8, 196, 246.9, 293.7], [110, 138.6, 164.8, 196]];
    const melody = [587.3, 659.3, 740, 880, 987.8, 740, 659.3, 587.3, 493.9, 587.3, 659.3, 440, 587.3, 740, 659.3, 587.3];
    const schedule = () => {
      const now = context.currentTime;
      if (this.paused || context.state !== "running") { music.nextBeat = now + 0.1; return; }
      while (music.nextBeat < now + 0.3) {
        const beat = music.beat; const at = music.nextBeat;
        const chord = chords[Math.floor(beat / 2) % chords.length];
        if (beat % 2 === 0) {
          this.note(context, gain, chord[0] / 2, at, beatSeconds * 1.9, 0.05, "sine");
          for (const [index, frequency] of chord.entries()) this.note(context, gain, frequency, at + index * 0.02, beatSeconds * 1.7, 0.018, "triangle");
        }
        // Skip a few beats so the tune breathes.
        if (beat % 8 !== 7 && beat % 3 !== 2) this.note(context, gain, melody[beat % melody.length], at + beatSeconds * 0.5, beatSeconds * 0.9, 0.022, "sine");
        music.beat += 1; music.nextBeat += beatSeconds;
      }
    };
    music.timer = window.setInterval(schedule, 100);
    schedule();
    this.music = music;
  }

  private street?: { gain: GainNode; timer: number; nextBeat: number; beat: number };

  /**
   * The street musician's guitar: a plucked folk progression, louder the closer
   * the goose is (`loudness` 0–1, 0 stops it). Follows the musician's playing state.
   */
  setStreetMusic(loudness: number): void {
    const context = this.context;
    if (loudness <= 0.001) {
      if (!this.street) return;
      const { gain, timer } = this.street; this.street = undefined;
      window.clearInterval(timer);
      if (context) { gain.gain.setTargetAtTime(0, context.currentTime, 0.08); window.setTimeout(() => gain.disconnect(), 600); }
      return;
    }
    if (this.street) { if (context) this.street.gain.gain.setTargetAtTime(loudness, context.currentTime, 0.25); return; }
    const running = this.runningContext(); if (!running) return;
    const gain = running.createGain(); gain.gain.value = 0; gain.connect(running.destination);
    gain.gain.setTargetAtTime(loudness, running.currentTime, 0.4);
    const street = { gain, timer: 0, nextBeat: running.currentTime + 0.1, beat: 0 };
    const beatSeconds = 60 / 104 / 2;
    // G – Em – C – D, picked as a rolling eighth-note pattern.
    const chords = [[98, 146.8, 196, 246.9, 293.7], [82.4, 123.5, 164.8, 196, 246.9], [130.8, 164.8, 196, 261.6, 329.6], [146.8, 220, 293.7, 370, 440]];
    const pattern = [0, 2, 3, 4, 3, 2, 1, 3];
    const schedule = () => {
      const now = running.currentTime;
      if (this.paused || running.state !== "running") { street.nextBeat = now + 0.1; return; }
      while (street.nextBeat < now + 0.3) {
        const chord = chords[Math.floor(street.beat / 8) % chords.length];
        const string = chord[pattern[street.beat % pattern.length]];
        this.pluck(running, gain, string, street.nextBeat, street.beat % 8 === 0 ? 0.07 : 0.045);
        street.beat += 1; street.nextBeat += beatSeconds;
      }
    };
    street.timer = window.setInterval(schedule, 100);
    schedule();
    this.street = street;
  }

  /** A short plucked string: bright attack, quick decay. */
  private pluck(context: AudioContext, output: AudioNode, frequency: number, at: number, volume: number): void {
    const oscillator = context.createOscillator(); const filter = context.createBiquadFilter(); const gain = context.createGain();
    oscillator.type = "sawtooth"; oscillator.frequency.value = frequency;
    filter.type = "lowpass"; filter.frequency.setValueAtTime(frequency * 8, at); filter.frequency.exponentialRampToValueAtTime(frequency * 1.5, at + 0.35);
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    oscillator.connect(filter); filter.connect(gain); gain.connect(output);
    oscillator.start(at); oscillator.stop(at + 0.95);
    oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  /** A goose honking into a guitar: a jangled chord that sags out of tune. */
  playTwang(): void {
    const context = this.runningContext(); if (!context) return;
    const now = context.currentTime;
    for (const [index, frequency] of [98, 146.8, 196, 247, 330].entries()) {
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(frequency * 1.03, now + index * 0.018);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.86, now + 0.9);
      gain.gain.setValueAtTime(0.0001, now + index * 0.018);
      gain.gain.exponentialRampToValueAtTime(0.05, now + index * 0.018 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(now + index * 0.018); oscillator.stop(now + 1.15);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  }

  private scrape?: { source: AudioBufferSourceNode; gain: GainNode; nodes: AudioNode[] };
  private dragBuffer?: AudioBuffer;

  /** Wood scraping on paving while a goose drags the guitar (`loudness` 0–1, 0 stops it). */
  setScrape(loudness: number): void {
    const context = this.context;
    if (loudness <= 0.001) {
      if (!this.scrape || !context) return;
      const { source, gain, nodes } = this.scrape; this.scrape = undefined;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      window.setTimeout(() => { try { source.stop(); } catch { /* already stopped */ } for (const node of nodes) node.disconnect(); }, 400);
      return;
    }
    if (this.scrape) {
      if (!context) return;
      // A rough, uneven grind: the level wobbles a little as it catches on the paving.
      this.scrape.gain.gain.setTargetAtTime(loudness * (SCRAPE_LEVEL + Math.random() * 0.02), context.currentTime, 0.04);
      return;
    }
    const running = this.runningContext(); const buffer = this.dragBuffer;
    if (!running || !buffer) return;
    // Each drag starts somewhere new in the loop, slightly higher or lower, so repeats don't sound identical.
    const source = running.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.playbackRate.value = 0.92 + Math.random() * 0.16;
    // A hollow guitar body: boost its two boom notes, soften the hiss, and add a tiny echo off the inside of the box.
    const filter = (type: BiquadFilterType, frequency: number, q: number, boost = 0): BiquadFilterNode => {
      const node = running.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q; node.gain.value = boost; return node;
    };
    const airBoom = filter("peaking", 105, 5, 14); const topBoom = filter("peaking", 230, 3, 10); const soften = filter("lowpass", 2400, 0.7);
    const box = running.createDelay(0.02); box.delayTime.value = 0.0045;
    const boxFeedback = running.createGain(); boxFeedback.gain.value = 0.62;
    const boxDamping = filter("lowpass", 1800, 0.7);
    const boxLevel = running.createGain(); boxLevel.gain.value = 0.85;
    const gain = running.createGain(); gain.gain.value = 0;
    source.connect(airBoom); airBoom.connect(topBoom); topBoom.connect(soften);
    soften.connect(gain); soften.connect(box);
    box.connect(boxDamping); boxDamping.connect(boxFeedback); boxFeedback.connect(box); boxDamping.connect(boxLevel); boxLevel.connect(gain);
    gain.connect(running.destination);
    source.start(0, Math.random() * buffer.duration);
    gain.gain.setTargetAtTime(loudness * SCRAPE_LEVEL, running.currentTime, 0.05);
    this.scrape = { source, gain, nodes: [source, airBoom, topBoom, soften, box, boxDamping, boxFeedback, boxLevel, gain] };
  }

  async playHonk(): Promise<void> {
    await this.play(HONK_URL, 0.72);
  }

  /** A light pitch wobble keeps the repeated cadence from sounding mechanical. */
  async playFootstep(): Promise<void> {
    await this.play(FOOTSTEP_URL, 0.4, 0.96 + Math.random() * 0.08);
  }
}
