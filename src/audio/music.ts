/**
 * 背景音樂：程式即時編的指彈吉他小品（不需要音檔，沒有授權問題）。
 * YenWel（自己彈指彈）說原本的吉他「很躁」：改成 64 BPM 的慢板，一個和弦撐兩小節，
 * 拇指只在第一拍輕輕彈根音，手指慢慢往上撥分解和弦，樂句結尾用泛音收；不刷弦、沒有重低音。
 * 晚上關燈後彈得更稀疏、更輕。這裡只有純函式，方便測試。
 */

export interface Note {
  /** 小節內的位置（八分音符，0～7）。 */
  step: number;
  midi: number;
  /** 0～1 */
  velocity: number;
  /** 泛音：鐘聲一樣的純音，不是撥弦。 */
  harmonic?: boolean;
}

interface Chord {
  name: string;
  root: number;
  fifth: number;
  /** 高音弦可以撥的音（由低到高）。 */
  treble: number[];
}

/** 吉他常見的開放和弦按法（MIDI 音高），D 大調、開放弦多，聽起來比較空靈。 */
export const PROGRESSION: Chord[] = [
  { name: 'Dmaj9', root: 50, fifth: 57, treble: [62, 64, 66, 69, 73] },
  { name: 'Gmaj7/D', root: 50, fifth: 55, treble: [62, 66, 67, 71, 74] },
  { name: 'Bm11', root: 47, fifth: 54, treble: [62, 64, 66, 69, 71] },
  { name: 'Asus2', root: 45, fifth: 52, treble: [61, 64, 69, 71, 76] },
];

/** 一個和弦撐幾小節。 */
export const BARS_PER_CHORD = 2;
export const BPM = 64;
export const STEPS_PER_BAR = 8;
export const STEP_SECONDS = 60 / BPM / 2;

/** 可重現的亂數（每小節固定種子，同一小節每次都彈一樣）。 */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function chordForBar(bar: number): Chord {
  const i = Math.floor(bar / BARS_PER_CHORD);
  return PROGRESSION[((i % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
}

/** 分解和弦的走法：多半是往上撥、再回來一個音。 */
const PATTERNS: number[][] = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [1, 2, 3, 2],
  [0, 1, 3, 2],
];

/**
 * 一小節要彈的音。
 * @param calm 0～1，越大越安靜稀疏（晚上、暫停時）。
 */
export function barNotes(bar: number, calm = 0): Note[] {
  const chord = chordForBar(bar);
  const r = rng(bar + 1);
  const notes: Note[] = [];
  const second = bar % BARS_PER_CHORD === 1;
  const phraseEnd = bar % 16 === 15;
  // 拇指：換和弦時第一拍輕輕彈根音，第二小節只偶爾補一個五度
  if (!second) notes.push({ step: 0, midi: chord.root, velocity: 0.42 });
  else if (r() < 0.5 - calm * 0.4) notes.push({ step: 4, midi: chord.fifth, velocity: 0.3 });
  if (phraseEnd) {
    // 樂句結尾：兩個泛音，讓尾巴留白
    notes.push({ step: 2, midi: chord.treble.at(-1)! + 12, velocity: 0.32, harmonic: true });
    notes.push({ step: 5, midi: chord.treble.at(-2)! + 12, velocity: 0.24, harmonic: true });
    return notes;
  }
  // 手指：慢慢往上撥分解和弦，每個音隔一拍左右，留很多空間
  const pattern = PATTERNS[Math.floor(r() * PATTERNS.length)];
  const base = Math.floor(r() * Math.max(1, chord.treble.length - 3));
  const steps = second ? [1, 3, 6] : [2, 4, 6];
  steps.forEach((step, i) => {
    if (r() < 0.12 + calm * 0.5) return;
    const idx = Math.min(chord.treble.length - 1, base + pattern[i]);
    notes.push({ step, midi: chord.treble[idx], velocity: 0.28 + r() * 0.14 });
  });
  // 偶爾在小節中間點一個泛音
  if (r() < 0.18 - calm * 0.15) notes.push({ step: 7, midi: chord.treble.at(-1)! + 12, velocity: 0.2, harmonic: true });
  return notes;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Karplus-Strong 撥弦合成：一段濾過的雜訊在延遲線裡來回衰減，聽起來像尼龍弦。
 * 回傳單聲道取樣。
 */
export function pluckSamples(freq: number, sampleRate: number, seconds: number, seed = 1): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  const period = Math.max(2, Math.round(sampleRate / freq));
  const r = rng(seed);
  // 激發：雜訊先低通一次，音色比較溫暖（像指肉而不是指甲）
  let prev = 0;
  for (let i = 0; i < period && i < out.length; i++) {
    const n = r() * 2 - 1;
    prev = prev * 0.72 + n * 0.28;
    out[i] = prev;
  }
  // 高音衰減快、低音衰減慢
  const decay = 0.996 - Math.min(0.012, freq / 120000);
  for (let i = period; i < out.length; i++) {
    out[i] = decay * 0.5 * (out[i - period] + out[i - period - 1 >= 0 ? i - period - 1 : i - period]);
  }
  // 起音稍微柔一點、尾巴淡出，避免爆音
  const attack = Math.floor(sampleRate * 0.004);
  for (let i = 0; i < attack && i < out.length; i++) out[i] *= i / attack;
  const fade = Math.floor(sampleRate * 0.3);
  for (let i = Math.max(0, out.length - fade); i < out.length; i++) out[i] *= (out.length - i) / fade;
  return out;
}
