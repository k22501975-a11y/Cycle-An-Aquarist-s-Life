import { barNotes, midiToFreq, pluckSamples, STEP_SECONDS, STEPS_PER_BAR } from './music';
import type { AudioSettings } from './settings';
import { SOUND_COOLDOWN_MS, Throttle, type SoundId } from './sounds';

/** 環境音要知道的缸內狀態。 */
export interface AmbienceState {
  filterOn: boolean;
  airPumpOn: boolean;
  /** 0～1，越大音樂越安靜稀疏（晚上、暫停時）。 */
  calm: number;
}

const PLUCK_RATE = 22050;
const LOOKAHEAD = 0.35;
const NOISE_FADE = 0.05;

/**
 * 聲音引擎（Web Audio）。全部即時合成，不需要音檔。
 * 瀏覽器規定要等玩家第一次點擊才能出聲，所以 unlock() 之前什麼都不做。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private reverb!: ConvolverNode;
  private flowGain!: GainNode;
  private noise!: AudioBuffer;
  private plucks = new Map<number, AudioBuffer>();
  private throttle = new Throttle();
  private nextBarTime = 0;
  private bar = 0;
  private nextBubble = 0;
  private timer: number | null = null;
  private ambience: AmbienceState = { filterOn: true, airPumpOn: false, calm: 0 };

  constructor(private settings: AudioSettings) {}

  get started(): boolean {
    return this.ctx !== null;
  }

  /** 第一次點擊時呼叫：建立音訊環境，開始播環境音與音樂。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    // 限幅，避免很多聲音疊在一起時爆音
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    this.master.connect(limiter).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverb.connect(wet).connect(this.master);

    // 音樂：吉他琴身的低頻共鳴＋柔化高頻
    this.musicBus = ctx.createGain();
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 220;
    body.gain.value = 3;
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 4200;
    this.musicBus.connect(body).connect(soft);
    soft.connect(this.master);
    soft.connect(this.reverb);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.3;
    this.sfxBus.connect(sfxSend).connect(this.reverb);

    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
    this.noise = this.brownNoise(4);
    this.startFlow();
    this.applySettings(this.settings);

    this.nextBarTime = ctx.currentTime + 0.3;
    this.nextBubble = ctx.currentTime + 1;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  applySettings(settings: AudioSettings): void {
    this.settings = settings;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.05);
    set(this.master, settings.muted ? 0 : settings.master);
    // 音量用平方曲線，滑桿中段聽起來比較自然
    set(this.musicBus, settings.music ** 2 * 0.9);
    set(this.sfxBus, settings.sfx ** 2);
    set(this.ambBus, settings.ambience ** 2);
  }

  setAmbience(state: AmbienceState): void {
    this.ambience = state;
    if (!this.ctx) return;
    this.flowGain.gain.setTargetAtTime(state.filterOn ? 0.5 : 0, this.ctx.currentTime, 0.4);
  }

  /** 分頁切到背景時暫停，省電。 */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const cooldown = SOUND_COOLDOWN_MS[id] ?? 60;
    if (!this.throttle.allow(id, performance.now(), cooldown)) return;
    const t = ctx.currentTime + 0.01;
    switch (id) {
      case 'tap':
        this.tone(t, 1250, 0.035, 0.12, 'sine', 900);
        break;
      case 'open':
        this.tone(t, 660, 0.12, 0.08, 'sine', 990);
        break;
      case 'feed':
        // 飼料撒進水面：一串細小的滴答
        for (let i = 0; i < 7; i++) this.drip(t + i * 0.045 + Math.random() * 0.03, 1400 + Math.random() * 1400, 0.09);
        break;
      case 'water':
        this.swoosh(t, 1.4, 900, 0.5);
        for (let i = 0; i < 10; i++) this.drip(t + 0.2 + Math.random() * 1.1, 500 + Math.random() * 600, 0.08);
        break;
      case 'test':
        // 試管輕碰＋滴劑
        this.tone(t, 2637, 0.6, 0.12, 'sine');
        this.tone(t, 3951, 0.4, 0.05, 'sine');
        this.drip(t + 0.25, 900, 0.12);
        this.drip(t + 0.45, 1000, 0.1);
        break;
      case 'trim':
        this.snip(t);
        this.snip(t + 0.14);
        break;
      case 'buy':
        this.pluck(t, 76, 0.5, this.sfxBus);
        this.pluck(t + 0.09, 81, 0.5, this.sfxBus);
        break;
      case 'net':
        this.swoosh(t, 0.45, 1600, 0.35);
        break;
      case 'birth':
        // 新生命：上行的撥弦琶音
        [69, 73, 76, 81, 85].forEach((m, i) => this.pluck(t + i * 0.11, m, 0.55, this.sfxBus));
        break;
      case 'death':
        // 嚴肅、低沉、不搞笑
        this.pluck(t, 50, 0.6, this.sfxBus);
        this.pluck(t + 0.5, 45, 0.5, this.sfxBus);
        this.tone(t, 110, 2.2, 0.1, 'sine');
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.tone(t + i * 0.36, 880, 0.15, 0.12, 'triangle');
          this.tone(t + i * 0.36 + 0.17, 660, 0.15, 0.12, 'triangle');
        }
        break;
      case 'warn':
        this.tone(t, 587, 0.25, 0.12, 'triangle');
        this.tone(t + 0.2, 466, 0.35, 0.12, 'triangle');
        break;
      case 'quest':
        // 任務完成：明亮的撥弦雙音＋泛音
        this.pluck(t, 74, 0.6, this.sfxBus);
        this.pluck(t + 0.12, 78, 0.6, this.sfxBus);
        this.pluck(t + 0.24, 86, 0.45, this.sfxBus);
        break;
      case 'restore':
        this.tone(t, 523, 0.2, 0.1, 'sine');
        this.tone(t + 0.15, 784, 0.35, 0.1, 'sine');
        break;
    }
  }

  // ---- 排程：音樂與氣泡，每 100ms 往前排 0.35 秒 ----
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.nextBarTime < now) this.nextBarTime = now + 0.05;
    while (this.nextBarTime < now + LOOKAHEAD) {
      const barLen = STEP_SECONDS * STEPS_PER_BAR;
      for (const n of barNotes(this.bar, this.ambience.calm)) {
        // 一點點人味：時間微微前後、拇指比手指早一點點
        const swing = n.step % 2 === 1 ? STEP_SECONDS * 0.08 : 0;
        this.pluck(this.nextBarTime + n.step * STEP_SECONDS + swing + (Math.random() - 0.5) * 0.012, n.midi, n.velocity, this.musicBus);
      }
      this.nextBarTime += barLen;
      this.bar++;
    }
    if (this.ambience.airPumpOn) {
      while (this.nextBubble < now + LOOKAHEAD) {
        this.bubble(this.nextBubble);
        this.nextBubble += 0.08 + Math.random() * 0.35;
      }
    } else {
      this.nextBubble = now + 0.5;
    }
  }

  // ---- 合成積木 ----
  private pluck(t: number, midi: number, velocity: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    let buf = this.plucks.get(midi);
    if (!buf) {
      const data = pluckSamples(midiToFreq(midi), PLUCK_RATE, midi < 55 ? 3.2 : 2.4, midi);
      buf = ctx.createBuffer(1, data.length, PLUCK_RATE);
      buf.copyToChannel(data, 0);
      this.plucks.set(midi, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = velocity * 0.8;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.5, Math.min(0.5, (midi - 60) / 30));
    src.connect(g).connect(pan).connect(dest);
    src.start(Math.max(t, ctx.currentTime));
  }

  private tone(t: number, freq: number, dur: number, gain: number, type: OscillatorType, endFreq?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** 水滴：快速上滑的正弦波。 */
  private drip(t: number, freq: number, gain: number, dest: AudioNode = this.sfxBus): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 2.2, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private bubble(t: number): void {
    this.drip(t, 350 + Math.random() * 500, 0.05 + Math.random() * 0.05, this.ambBus);
  }

  /** 水流聲：雜訊經過濾波器，音量起伏。 */
  private swoosh(t: number, dur: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq * 0.6, t);
    f.frequency.linearRampToValueAtTime(freq, t + dur * 0.4);
    f.frequency.linearRampToValueAtTime(freq * 0.5, t + dur);
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  /** 剪刀：短促的高頻雜訊＋金屬感。 */
  private snip(t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 0.08);
    this.tone(t, 4200, 0.06, 0.05, 'triangle');
  }

  /** 過濾器出水的持續水流聲（循環播放的低頻雜訊，音量慢慢起伏）。 */
  private startFlow(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopEnd = this.noise.duration - NOISE_FADE;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    this.flowGain = ctx.createGain();
    this.flowGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 180;
    lfo.connect(lfoDepth).connect(lp.frequency);
    src.connect(hp).connect(lp).connect(this.flowGain).connect(this.ambBus);
    src.start();
    lfo.start();
  }

  private brownNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    // 開頭和最後一段交叉淡化，循環只播到那段之前，接縫就不會有爆音
    const x = Math.floor(ctx.sampleRate * NOISE_FADE);
    for (let i = 0; i < x; i++) {
      const k = i / x;
      d[i] = d[i] * k + d[d.length - x + i] * (1 - k);
    }
    return buf;
  }

  /** 產生房間殘響的脈衝響應（衰減的雜訊）。 */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
