export type FootstepSurface = 'sand' | 'surf' | 'rock' | 'wood';

export class BeachAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private surfFilter: BiquadFilterNode | null = null;
  private surfGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = false;
  private trackPlayed = false;
  private trackIntervalId: number | null = null;
  private rafSurfTime = 0;
  private customAudioEl: HTMLAudioElement | null = null;
  private customObjectUrl: string | null = null;
  private customTrackTitle: string | null = null;
  private customTrackSubtitle: string | null = null;
  private customFadeTimer: number | null = null;
  private customPlaying = false;
  private onMusicStateChange?: () => void;

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

    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    musicGain.connect(ctx.destination);
    this.musicGain = musicGain;

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
    this.windGain = windGain;

    // Rain Patter / Downpour Layer (highpass filtered hiss)
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = buffer;
    rainSrc.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1450;
    rainFilter.Q.value = 0.4;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.0;

    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();
    this.rainGain = rainGain;
  }

  public update(
    delta: number,
    distToWater: number,
    rainWeight = 0,
    windStrength = 0.35
  ): void {
    if (!this.enabled || !this.ctx || !this.surfFilter || !this.surfGain) return;
    this.rafSurfTime += delta;
    const swell = Math.sin(this.rafSurfTime * 0.65) * 0.5 + 0.5;
    const proximity = Math.max(0.25, 1.0 - Math.min(distToWater, 60) / 75);
    this.surfFilter.frequency.setTargetAtTime(220 + swell * 340 * proximity, this.ctx.currentTime, 0.1);
    this.surfGain.gain.setTargetAtTime((0.18 + swell * 0.24) * proximity, this.ctx.currentTime, 0.1);

    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(0.06 + windStrength * 0.11, this.ctx.currentTime, 0.2);
    }
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(rainWeight * 0.16, this.ctx.currentTime, 0.2);
    }
  }

  public playFootstep(
    surface: FootstepSurface,
    heavyCargo = false,
    weightKg = 0
  ): void {
    if (!this.enabled || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const master = this.masterGain;
    const now = ctx.currentTime;

    if (surface === 'surf') {
      // Wet splashing in ocean surf: mid-body water slosh + high-frequency spray shimmer
      const sloshSrc = ctx.createBufferSource();
      sloshSrc.buffer = this.noiseBuffer;
      const sloshFilter = ctx.createBiquadFilter();
      sloshFilter.type = 'bandpass';
      sloshFilter.frequency.setValueAtTime(820 + Math.random() * 240, now);
      sloshFilter.frequency.exponentialRampToValueAtTime(520, now + 0.24);
      sloshFilter.Q.value = 0.95;

      const sloshGain = ctx.createGain();
      sloshGain.gain.setValueAtTime(0.001, now);
      sloshGain.gain.exponentialRampToValueAtTime(0.2, now + 0.024);
      sloshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      sloshSrc.connect(sloshFilter);
      sloshFilter.connect(sloshGain);
      sloshGain.connect(master);
      sloshSrc.start(now, Math.random() * 1.4, 0.28);

      const spraySrc = ctx.createBufferSource();
      spraySrc.buffer = this.noiseBuffer;
      const sprayFilter = ctx.createBiquadFilter();
      sprayFilter.type = 'highpass';
      sprayFilter.frequency.value = 2600 + Math.random() * 500;
      const sprayGain = ctx.createGain();
      sprayGain.gain.setValueAtTime(0.001, now + 0.01);
      sprayGain.gain.exponentialRampToValueAtTime(0.09, now + 0.035);
      sprayGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      spraySrc.connect(sprayFilter);
      sprayFilter.connect(sprayGain);
      sprayGain.connect(master);
      spraySrc.start(now + 0.01, Math.random() * 1.4, 0.24);
    } else if (surface === 'wood') {
      // Resonant wooden plank / ladder rung thud
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195 + Math.random() * 28, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.09);

      const thudGain = ctx.createGain();
      thudGain.gain.setValueAtTime(0.001, now);
      thudGain.gain.exponentialRampToValueAtTime(0.16, now + 0.008);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(thudGain);
      thudGain.connect(master);
      osc.start(now);
      osc.stop(now + 0.12);

      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = this.noiseBuffer;
      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = 'bandpass';
      clickFilter.frequency.value = 720 + Math.random() * 140;
      clickFilter.Q.value = 1.6;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.001, now);
      clickGain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      clickSrc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(master);
      clickSrc.start(now, Math.random() * 1.5, 0.09);
    } else if (surface === 'rock') {
      // Dry desert sandstone / basalt grit tap
      const thudSrc = ctx.createBufferSource();
      thudSrc.buffer = this.noiseBuffer;
      const thudFilter = ctx.createBiquadFilter();
      thudFilter.type = 'lowpass';
      thudFilter.frequency.value = 540 + Math.random() * 160;
      const thudGain = ctx.createGain();
      thudGain.gain.setValueAtTime(0.001, now);
      thudGain.gain.exponentialRampToValueAtTime(0.15, now + 0.009);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      thudSrc.connect(thudFilter);
      thudFilter.connect(thudGain);
      thudGain.connect(master);
      thudSrc.start(now, Math.random() * 1.5, 0.1);

      const gritSrc = ctx.createBufferSource();
      gritSrc.buffer = this.noiseBuffer;
      const gritFilter = ctx.createBiquadFilter();
      gritFilter.type = 'bandpass';
      gritFilter.frequency.value = 1850 + Math.random() * 480;
      gritFilter.Q.value = 1.3;
      const gritGain = ctx.createGain();
      gritGain.gain.setValueAtTime(0.001, now + 0.012);
      gritGain.gain.exponentialRampToValueAtTime(0.09, now + 0.022);
      gritGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      gritSrc.connect(gritFilter);
      gritFilter.connect(gritGain);
      gritGain.connect(master);
      gritSrc.start(now + 0.012, Math.random() * 1.5, 0.09);
    } else {
      // Volcanic sand: crisp granular multi-burst crunch + soft heel sink
      const heelSrc = ctx.createBufferSource();
      heelSrc.buffer = this.noiseBuffer;
      const heelFilter = ctx.createBiquadFilter();
      heelFilter.type = 'lowpass';
      heelFilter.frequency.value = 340 + Math.random() * 90;
      const heelGain = ctx.createGain();
      heelGain.gain.setValueAtTime(0.001, now);
      heelGain.gain.exponentialRampToValueAtTime(0.13, now + 0.014);
      heelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      heelSrc.connect(heelFilter);
      heelFilter.connect(heelGain);
      heelGain.connect(master);
      heelSrc.start(now, Math.random() * 1.5, 0.13);

      // 3 staggered granular crunch micro-bursts for coarse black volcanic sand
      const grainOffsets = [0.0, 0.026, 0.054];
      const grainFreqs = [1650, 2250, 1920];
      const grainAmps = [0.11, 0.085, 0.06];
      for (let g = 0; g < grainOffsets.length; g++) {
        const t = now + grainOffsets[g];
        const grainSrc = ctx.createBufferSource();
        grainSrc.buffer = this.noiseBuffer;
        const grainFilter = ctx.createBiquadFilter();
        grainFilter.type = 'bandpass';
        grainFilter.frequency.value = grainFreqs[g] + (Math.random() - 0.5) * 340;
        grainFilter.Q.value = 1.7;

        const grainGain = ctx.createGain();
        grainGain.gain.setValueAtTime(0.001, t);
        grainGain.gain.exponentialRampToValueAtTime(grainAmps[g], t + 0.008);
        grainGain.gain.exponentialRampToValueAtTime(0.001, t + 0.048);

        grainSrc.connect(grainFilter);
        grainFilter.connect(grainGain);
        grainGain.connect(master);
        grainSrc.start(t, Math.random() * 1.5, 0.06);
      }
    }

    // Metallic latch & rack clinking layer when carrying heavy cargo
    if (heavyCargo) {
      const loadFactor = Math.min(1, Math.max(0.28, weightKg / 42));
      const clinkTimes = [now + 0.012, now + 0.055];
      const baseFreqs = [2420, 3680];
      clinkTimes.forEach((t, idx) => {
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        oscA.type = 'triangle';
        oscB.type = 'sine';
        const fA = baseFreqs[idx] * (0.94 + Math.random() * 0.14);
        const fB = fA * 1.49;
        oscA.frequency.setValueAtTime(fA, t);
        oscB.frequency.setValueAtTime(fB, t);

        const clinkGain = ctx.createGain();
        clinkGain.gain.setValueAtTime(0.0005, t);
        clinkGain.gain.exponentialRampToValueAtTime((idx === 0 ? 0.042 : 0.026) * loadFactor, t + 0.004);
        clinkGain.gain.exponentialRampToValueAtTime(0.0005, t + (idx === 0 ? 0.062 : 0.045));

        oscA.connect(clinkGain);
        oscB.connect(clinkGain);
        clinkGain.connect(master);
        oscA.start(t);
        oscB.start(t);
        oscA.stop(t + 0.075);
        oscB.stop(t + 0.075);
      });
    }
  }

  public playWormEat(): void {
    if (!this.ctx) {
      this.ensureInitialized();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    const notes = [392, 523.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0005, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.09, now + idx * 0.06 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.06 + 0.24);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.26);
    });
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

  public playCargoPickup(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(510, now + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCargoDeliver(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.38);
    });
  }

  public playBoundaryThud(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playCrystalCollect(): void {
    if (!this.ctx || !this.masterGain) {
      this.ensureInitialized();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    const notes = [880, 1174.66, 1567.98];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + idx * 0.045);
      gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.045 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.045 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.38);
    });
  }

  public playCraftEquip(): void {
    if (!this.ctx) {
      this.ensureInitialized();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.09);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playFallImpact(severity = 0.6): void {
    if (!this.ctx) {
      this.ensureInitialized();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const clamped = Math.min(1, Math.max(0.25, severity));

    // Heavy low body thump
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(125 + clamped * 35, now);
    thudOsc.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.001, now);
    thudGain.gain.linearRampToValueAtTime(0.18 * clamped + 0.06, now + 0.012);
    thudGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.28);
    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + 0.3);

    // Loose gravel/sand skid burst on impact
    if (this.noiseBuffer) {
      const gritSrc = ctx.createBufferSource();
      gritSrc.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 920;
      filter.Q.value = 0.85;
      const gGain = ctx.createGain();
      gGain.gain.setValueAtTime(0.001, now);
      gGain.gain.linearRampToValueAtTime(0.14 * clamped, now + 0.02);
      gGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);
      gritSrc.connect(filter);
      filter.connect(gGain);
      gGain.connect(ctx.destination);
      gritSrc.start(now, Math.random() * 1.4, 0.26);
    }
  }

  public playSlipScrape(): void {
    if (!this.enabled || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(680, now + 0.16);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, Math.random() * 1.4, 0.2);
  }

  public playStationRepair(): void {
    if (!this.ctx) {
      this.ensureInitialized();
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freqs = [330, 495, 660];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.055);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0005, now + idx * 0.055);
      gain.gain.linearRampToValueAtTime(0.085, now + idx * 0.055 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + idx * 0.055 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.24);
    });
  }

  public setOnMusicStateChange(cb: () => void): void {
    this.onMusicStateChange = cb;
  }

  public getCustomTrackInfo(): {
    title: string;
    subtitle: string;
    isPlaying: boolean;
  } | null {
    if (!this.customTrackTitle) return null;
    return {
      title: this.customTrackTitle,
      subtitle: this.customTrackSubtitle ?? 'Custom Audio',
      isPlaying: this.customPlaying,
    };
  }

  public async setCustomMusicFile(file: File): Promise<{ title: string; subtitle: string }> {
    this.stopCustomTrack();
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }

    const url = URL.createObjectURL(file);
    this.customObjectUrl = url;

    const cleanTitle =
      file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_]+/g, ' ')
        .trim() || 'Custom Track';

    const el = new Audio(url);
    el.preload = 'metadata';
    el.volume = 0;
    el.onended = () => {
      this.stopCustomTrack();
    };

    const durationSec = await new Promise<number>((resolve) => {
      const timer = window.setTimeout(() => resolve(0), 1500);
      el.addEventListener(
        'loadedmetadata',
        () => {
          clearTimeout(timer);
          resolve(Number.isFinite(el.duration) ? el.duration : 0);
        },
        { once: true }
      );
      el.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          resolve(0);
        },
        { once: true }
      );
    });

    const mins = Math.floor(durationSec / 60);
    const secs = Math.floor(durationSec % 60);
    const durLabel =
      durationSec > 0
        ? `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : 'Custom Audio';

    this.customAudioEl = el;
    this.customTrackTitle = cleanTitle;
    this.customTrackSubtitle = `Custom Track · ${durLabel}`;
    this.onMusicStateChange?.();
    return { title: cleanTitle, subtitle: this.customTrackSubtitle };
  }

  public clearCustomMusic(): void {
    this.stopCustomTrack();
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    this.customAudioEl = null;
    this.customTrackTitle = null;
    this.customTrackSubtitle = null;
    this.onMusicStateChange?.();
  }

  public stopCustomTrack(): void {
    if (this.customFadeTimer !== null) {
      clearInterval(this.customFadeTimer);
      this.customFadeTimer = null;
    }
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl.currentTime = 0;
      this.customAudioEl.volume = 0;
    }
    if (this.customPlaying) {
      this.customPlaying = false;
      this.onMusicStateChange?.();
    }
  }

  public playCustomTrack(capSeconds?: number): boolean {
    if (!this.customAudioEl) return false;
    // Stop procedural music if active
    if (this.trackIntervalId !== null) {
      clearInterval(this.trackIntervalId);
      this.trackIntervalId = null;
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
    }

    this.stopCustomTrack();
    const el = this.customAudioEl;
    el.currentTime = 0;
    el.volume = 0.02;
    this.customPlaying = true;
    this.onMusicStateChange?.();

    void el.play().catch(() => {
      this.customPlaying = false;
      this.onMusicStateChange?.();
    });

    const startMs = performance.now();
    const targetVol = 0.56;
    this.customFadeTimer = window.setInterval(() => {
      if (!this.customPlaying || !this.customAudioEl) {
        if (this.customFadeTimer !== null) {
          clearInterval(this.customFadeTimer);
          this.customFadeTimer = null;
        }
        return;
      }
      const elapsedSec = (performance.now() - startMs) / 1000;
      let vol = targetVol;
      if (elapsedSec < 2.5) {
        vol = Math.max(0.02, (elapsedSec / 2.5) * targetVol);
      }
      if (capSeconds !== undefined) {
        if (elapsedSec >= capSeconds) {
          this.stopCustomTrack();
          return;
        }
        if (elapsedSec > capSeconds - 5.0) {
          vol = Math.max(0.005, ((capSeconds - elapsedSec) / 5.0) * targetVol);
        }
      }
      this.customAudioEl.volume = Math.min(1, Math.max(0, vol));
    }, 80);

    return true;
  }

  public toggleCustomPlayback(): boolean {
    if (!this.customAudioEl) return false;
    if (this.customPlaying) {
      this.stopCustomTrack();
      return false;
    }
    return this.playCustomTrack();
  }

  public playCoastalTrackOnce(durationSeconds = 105): boolean {
    if (this.trackPlayed) return false;
    this.trackPlayed = true;

    if (this.customAudioEl) {
      return this.playCustomTrack(durationSeconds);
    }

    this.ensureInitialized();
    if (!this.ctx || !this.musicGain) return false;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const startTime = ctx.currentTime + 0.05;
    const endTime = startTime + durationSeconds;

    // Fade in gently over 3.5s, sustain warm volume, and fade out over final 6s
    this.musicGain.gain.cancelScheduledValues(startTime);
    this.musicGain.gain.setValueAtTime(0.0001, startTime);
    this.musicGain.gain.linearRampToValueAtTime(0.36, startTime + 3.5);
    this.musicGain.gain.setValueAtTime(0.36, Math.max(startTime + 4, endTime - 6.5));
    this.musicGain.gain.linearRampToValueAtTime(0.0001, endTime);

    // Am9 -> Fmaj7 -> Cadd9 -> Em7 sparse coastal progression (~68 BPM)
    const chords: { bass: number; pad: number[]; arp: number[] }[] = [
      { bass: 110.0, pad: [220.0, 261.63, 329.63, 493.88], arp: [440, 523.25, 659.25, 493.88] },
      { bass: 87.31, pad: [174.61, 220.0, 261.63, 329.63], arp: [349.23, 440, 523.25, 659.25] },
      { bass: 130.81, pad: [196.0, 261.63, 329.63, 587.33], arp: [392.0, 523.25, 659.25, 587.33] },
      { bass: 82.41, pad: [164.81, 246.94, 293.66, 392.0], arp: [329.63, 493.88, 587.33, 392.0] },
    ];

    const stepDur = 0.88; // ~68 BPM quarter note
    let step = 0;

    const scheduleStep = (when: number, stepIdx: number) => {
      if (!this.ctx || !this.musicGain || when >= endTime - 1.5) return;
      const chord = chords[Math.floor(stepIdx / 4) % chords.length];
      const beatInBar = stepIdx % 4;

      // On beat 0 of every bar: warm detuned pad swell & deep sub bass
      if (beatInBar === 0) {
        const barLen = Math.min(stepDur * 4.1, endTime - when);

        const bassOsc = ctx.createOscillator();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(chord.bass, when);
        const bassGain = ctx.createGain();
        bassGain.gain.setValueAtTime(0.0001, when);
        bassGain.gain.linearRampToValueAtTime(0.24, when + 0.35);
        bassGain.gain.exponentialRampToValueAtTime(0.001, when + barLen);
        bassOsc.connect(bassGain);
        bassGain.connect(this.musicGain);
        bassOsc.start(when);
        bassOsc.stop(when + barLen + 0.05);

        chord.pad.forEach((freq, idx) => {
          if (!this.musicGain) return;
          const osc = ctx.createOscillator();
          osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, when);
          osc.detune.setValueAtTime(idx % 2 === 0 ? -4 : 5, when);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(480, when);
          filter.frequency.linearRampToValueAtTime(920, when + barLen * 0.5);
          filter.frequency.linearRampToValueAtTime(420, when + barLen);

          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, when);
          g.gain.linearRampToValueAtTime(0.055, when + 0.75);
          g.gain.exponentialRampToValueAtTime(0.0008, when + barLen);

          osc.connect(filter);
          filter.connect(g);
          g.connect(this.musicGain);
          osc.start(when);
          osc.stop(when + barLen + 0.05);
        });
      }

      // Delicate sparse electric-piano/bell pluck with gentle echo repeat
      const noteFreq = chord.arp[beatInBar];
      const echoOffsets = [0, 0.44, 0.88];
      const echoAmps = [0.11, 0.045, 0.018];
      echoOffsets.forEach((offset, eIdx) => {
        const t = when + offset;
        if (!this.musicGain || t >= endTime - 0.5) return;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(noteFreq, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(echoAmps[eIdx], t + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0006, t + 1.45);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(t);
        osc.stop(t + 1.5);
      });
    };

    // Schedule first 2 steps immediately, then top up ahead smoothly
    let nextStepTime = startTime;
    while (nextStepTime < startTime + 1.8 && nextStepTime < endTime) {
      scheduleStep(nextStepTime, step++);
      nextStepTime += stepDur;
    }

    this.trackIntervalId = window.setInterval(() => {
      if (!this.ctx || ctx.currentTime >= endTime) {
        if (this.trackIntervalId !== null) {
          clearInterval(this.trackIntervalId);
          this.trackIntervalId = null;
        }
        return;
      }
      while (nextStepTime < ctx.currentTime + 2.2 && nextStepTime < endTime) {
        scheduleStep(nextStepTime, step++);
        nextStepTime += stepDur;
      }
    }, 500);

    return true;
  }

  public dispose(): void {
    this.stopCustomTrack();
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    this.customAudioEl = null;
    if (this.trackIntervalId !== null) {
      clearInterval(this.trackIntervalId);
      this.trackIntervalId = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
