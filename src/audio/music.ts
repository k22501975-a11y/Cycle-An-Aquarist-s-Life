/**
 * 背景音樂：程式即時編的指彈吉他小品（不需要音檔）。
 * D 大調四和弦循環，低音拇指交替彈根音與五度，高音弦用手指撥分解和弦，
 * 每段隨機變化；晚上關燈後彈得更稀疏、更輕。這裡只有純函式，方便測試。
 */

export interface Note {
  /** 小節內的位置（八分音符，0～7）。 */
  step: number;
  midi: number;
  /** 0～1 */
  velocity: number;
}

interface Chord {
  name: string;
  root: number;
  fifth: number;
  /** 高音弦可以撥的音（由低到高）。 */
  treble: number[];
}

/** 吉他常見的開放和弦按法（MIDI 音高）。 */
export const PROGRESSION: Chord[] = [
  { name: 'Dmaj9', root: 50, fifth: 57, treble: [62, 64, 66, 69, 73, 76] },
  { name: 'Bm7', root: 47, fifth: 54, treble: [62, 66, 69, 71, 74] },
  { name: 'Gmaj7', root: 43, fifth: 50, treble: [62, 66, 67, 71, 74] },
  { name: 'A7sus4', root: 45, fifth: 52, treble: [62, 64, 67, 69, 74] },
];

export const BPM = 72;
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
  return PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
}

/**
 * 一小節要彈的音。
 * @param calm 0～1，越大越安靜稀疏（晚上、暫停時）。
 */
export function barNotes(bar: number, calm = 0): Note[] {
  const chord = chordForBar(bar);
  const r = rng(bar + 1);
  const notes: Note[] = [];
  const phraseEnd = bar % 16 === 15;
  // 拇指：1、3 拍根音，2、4 拍五度（Travis picking）
  for (const [step, midi] of [[0, chord.root], [2, chord.fifth], [4, chord.root], [6, chord.fifth]] as const) {
    if (calm > 0.5 && (step === 2 || step === 6)) continue;
    notes.push({ step, midi, velocity: step === 0 ? 0.7 : 0.5 });
  }
  if (phraseEnd) {
    // 樂句結尾：只彈和弦加一個高音泛音感的長音
    notes.push({ step: 0, midi: chord.treble.at(-1)! + 12, velocity: 0.35 });
    return notes;
  }
  // 手指：反拍撥高音，旋律大多往相鄰的音走
  let idx = Math.floor(r() * chord.treble.length);
  for (const step of [1, 3, 5, 7]) {
    if (r() < 0.15 + calm * 0.45) continue;
    const move = r();
    idx += move < 0.35 ? -1 : move < 0.7 ? 1 : move < 0.85 ? 2 : -2;
    idx = Math.max(0, Math.min(chord.treble.length - 1, idx));
    notes.push({ step, midi: chord.treble[idx], velocity: 0.45 + r() * 0.25 });
  }
  // 偶爾在第一拍捏一個高音（pinch）
  if (r() < 0.4 - calm * 0.3) notes.push({ step: 0, midi: chord.treble[chord.treble.length - 2], velocity: 0.55 });
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
    prev = prev * 0.55 + n * 0.45;
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
