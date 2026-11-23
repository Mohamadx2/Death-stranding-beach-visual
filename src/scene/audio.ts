export class BeachAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private surfFilter: BiquadFilterNode | null = null;
  private surfGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = false;
  private rafSurfTime = 0;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): boolean {
    if (next) {
      this.ensureInitialized();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.25);
      }
      this.enabled = true;
    } else {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.15);
      }
      this.enabled = false;
    }
    return this.enabled;
  }

  private ensureInitialized(): void {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.masterGain = master;

    // 3-second pink-ish noise buffer for surf, wind, and footsteps
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.08) * 0.35;
    }
    this.noiseBuffer = buffer;

    // Rolling Ocean Surf Layer
    const surfSrc = ctx.createBufferSource();
    surfSrc.buffer = buffer;
    surfSrc.loop = true;

    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 320;
    surfFilter.Q.value = 0.6;

    const surfGain = ctx.createGain();
    surfGain.gain.value = 0.28;

    surfSrc.connect(surfFilter);
    surfFilter.connect(surfGain);
    surfGain.connect(master);
    surfSrc.start();

    this.surfFilter = surfFilter;
    this.surfGain = surfGain;

    // High Coastal Wind Layer
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buffer;
    windSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 1.4;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.09;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();
  }

  public update(delta: number, distToWater: number): void {
    if (!this.enabled || !this.ctx || !this.surfFilter || !this.surfGain) return;
    this.rafSurfTime += delta;
    const swell = Math.sin(this.rafSurfTime * 0.65) * 0.5 + 0.5;
    const proximity = Math.max(0.25, 1.0 - Math.min(distToWater, 60) / 75);
    this.surfFilter.frequency.setTargetAtTime(220 + swell * 340 * proximity, this.ctx.currentTime, 0.1);
    this.surfGain.gain.setTargetAtTime((0.18 + swell * 0.24) * proximity, this.ctx.currentTime, 0.1);
  }

  public playFootstep(wading: boolean): void {
    if (!this.enabled || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = wading ? 'bandpass' : 'lowpass';
    filter.frequency.value = wading ? 950 + Math.random() * 250 : 420 + Math.random() * 140;
    filter.Q.value = wading ? 1.1 : 0.7;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(wading ? 0.18 : 0.14, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (wading ? 0.22 : 0.13));

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now, Math.random() * 1.5, wading ? 0.26 : 0.16);
  }

  public playScanChime(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.75);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.9);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
