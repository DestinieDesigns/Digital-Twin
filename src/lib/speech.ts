/**
 * Speech measurement.
 *
 * Decodes a recording locally and measures real signal properties:
 * pitch track, intonation range, pause structure, loudness dynamics and a
 * syllable-nuclei pacing proxy. No transcription, no emotion inference, no
 * cloud call, no synthetic voice.
 */
import type { SpeechMetrics } from "../../shared/behavior";

const round = (value: number, digits = 3) => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const index = clamp(Math.round((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[index];
}

export async function analyzeSpeechFromBlob(blob: Blob): Promise<SpeechMetrics> {
  const buffer = await blob.arrayBuffer();
  const AudioCtor: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioCtor) throw new Error("This browser does not support the Web Audio API.");
  const ctx = new AudioCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buffer.slice(0));
  } finally {
    void ctx.close();
  }
  return analyzeSpeechBuffer(decoded);
}

export function analyzeSpeechBuffer(decoded: AudioBuffer): SpeechMetrics {
  const warnings: string[] = [];
  const sampleRate = decoded.sampleRate;
  const duration = decoded.duration;
  const channels = decoded.numberOfChannels;
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < channels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / channels;
  }

  // Decimate to 8 kHz — enough for speech pitch and energy, much faster.
  const targetRate = 8000;
  const decimation = Math.max(1, Math.round(sampleRate / targetRate));
  const rate = sampleRate / decimation;
  const down = new Float32Array(Math.floor(mono.length / decimation));
  for (let i = 0; i < down.length; i++) {
    let sum = 0;
    for (let j = 0; j < decimation; j++) sum += mono[i * decimation + j] ?? 0;
    down[i] = sum / decimation;
  }

  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < mono.length; i++) {
    const value = mono[i];
    peak = Math.max(peak, Math.abs(value));
    sumSquares += value * value;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, mono.length));
  const peakDb = round(20 * Math.log10(peak || 1e-6), 1);
  const rmsDb = round(20 * Math.log10(rms || 1e-6), 1);
  if (peakDb > -0.5) warnings.push("The recording is close to clipping; peaks may distort the measurements.");
  if (rmsDb < -42) warnings.push("Very low recording level; raise the input gain for a cleaner pitch track.");

  const frameSize = Math.round(rate * 0.032); // 32 ms
  const hop = Math.round(rate * 0.016); // 16 ms
  const frameCount = Math.max(1, Math.floor((down.length - frameSize) / hop));
  const energies = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    for (let i = 0; i < frameSize; i++) {
      const value = down[f * hop + i] ?? 0;
      sum += value * value;
    }
    energies[f] = Math.sqrt(sum / frameSize);
  }
  const dbs = Array.from(energies, (value) => 20 * Math.log10(value || 1e-6));
  const sortedDb = [...dbs].sort((a, b) => a - b);
  const noiseFloor = percentile(sortedDb, 0.15);
  const gateDb = Math.max(noiseFloor + 8, -52);
  const active = dbs.map((db) => db > gateDb);
  const activeCount = active.filter(Boolean).length;
  const voicedRatio = round(activeCount / frameCount, 3);

  // Pauses inside speech (between the first and last active frame).
  const firstActive = active.indexOf(true);
  const lastActive = active.lastIndexOf(true);
  const pauses: number[] = [];
  if (firstActive >= 0 && lastActive > firstActive) {
    let run = 0;
    for (let f = firstActive; f <= lastActive; f++) {
      if (!active[f]) run++;
      else {
        if (run * (hop / rate) >= 0.25) pauses.push(run * (hop / rate));
        run = 0;
      }
    }
  }
  const pauseSeconds = pauses.reduce((sum, value) => sum + value, 0);
  const speechSeconds = Math.max(0.001, (((lastActive - firstActive + 1) * hop) / rate) || duration);
  const pauseRatio = round(clamp(pauseSeconds / speechSeconds, 0, 1), 3);

  // Syllable nuclei: peaks in the smoothed energy envelope, ≥ 120 ms apart.
  const smoothed = Array.from(dbs, (_, index) => {
    let sum = 0;
    let count = 0;
    for (let j = index - 3; j <= index + 3; j++) {
      if (j >= 0 && j < dbs.length) {
        sum += dbs[j];
        count++;
      }
    }
    return sum / count;
  });
  const syllableGate = gateDb + 4;
  const minGap = Math.max(1, Math.round(0.12 / (hop / rate)));
  let nuclei = 0;
  let lastPeak = -minGap;
  for (let f = 1; f < smoothed.length - 1; f++) {
    if (smoothed[f] < syllableGate) continue;
    if (smoothed[f] < smoothed[f - 1] || smoothed[f] < smoothed[f + 1]) continue;
    if (f - lastPeak < minGap) continue;
    nuclei++;
    lastPeak = f;
  }
  const activeSeconds = Math.max(0.001, (activeCount * hop) / rate);
  const speechRate = nuclei > 4 ? round((nuclei / activeSeconds) * 60, 0) : null;

  // Pitch per active frame, coarse-to-fine autocorrelation.
  const minLag = Math.floor(rate / 600);
  const maxLag = Math.floor(rate / 70);
  const f0s: number[] = [];
  const f0Track: (number | null)[] = new Array(frameCount).fill(null);
  for (let f = 0; f < frameCount; f++) {
    if (!active[f]) continue;
    const start = f * hop;
    let bestLag = 0;
    let bestScore = 0;
    for (let lag = minLag; lag <= maxLag; lag += 2) {
      let correlation = 0;
      let energyA = 0;
      let energyB = 0;
      for (let i = 0; i < frameSize; i += 2) {
        const a = down[start + i] ?? 0;
        const b = down[start + i + lag] ?? 0;
        correlation += a * b;
        energyA += a * a;
        energyB += b * b;
      }
      const score = correlation / (Math.sqrt(energyA * energyB) || 1);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestLag > 0 && bestScore > 0.5) {
      const f0 = rate / bestLag;
      if (f0 >= 70 && f0 <= 600) {
        f0s.push(f0);
        f0Track[f] = f0;
      }
    }
  }
  f0s.sort((a, b) => a - b);
  const medianF0 = f0s.length ? round(percentile(f0s, 0.5), 1) : null;
  const f0Min = f0s.length ? round(percentile(f0s, 0.05), 1) : null;
  const f0Max = f0s.length ? round(percentile(f0s, 0.95), 1) : null;
  const intonationRange = f0Min && f0Max ? round(12 * Math.log2(f0Max / f0Min), 1) : null;

  const activeDbs = dbs.filter((_, index) => active[index]).sort((a, b) => a - b);
  const loudnessRange = activeDbs.length ? round(percentile(activeDbs, 0.95) - percentile(activeDbs, 0.05), 1) : 0;

  // Vibrato from the pitch residual (singing especially).
  let vibratoRateHz: number | null = null;
  let vibratoExtentCents: number | null = null;
  const voicedSeries = f0Track.filter((value): value is number => value !== null);
  if (voicedSeries.length > 40 && medianF0) {
    const residual: number[] = [];
    let run: number[] = [];
    for (const value of f0Track) {
      if (value === null) continue;
      run.push(value);
      if (run.length === 9) {
        const smooth = run.reduce((a, b) => a + b, 0) / run.length;
        residual.push(1200 * Math.log2(run[4] / smooth));
        run = run.slice(1);
      }
    }
    if (residual.length > 20) {
      const mean = residual.reduce((a, b) => a + b, 0) / residual.length;
      const centered = residual.map((value) => value - mean);
      let crossings = 0;
      for (let i = 1; i < centered.length; i++) {
        if ((centered[i - 1] < 0 && centered[i] >= 0) || (centered[i - 1] >= 0 && centered[i] < 0)) crossings++;
      }
      const seconds = centered.length * (hop / rate) * 8;
      const rateHz = crossings / 2 / Math.max(0.1, seconds);
      const extent = Math.sqrt(centered.reduce((a, b) => a + b * b, 0) / centered.length);
      if (rateHz >= 3 && rateHz <= 10 && extent > 5) {
        vibratoRateHz = round(rateHz, 2);
        vibratoExtentCents = round(extent, 1);
      }
    }
  }

  const contourSize = 200;
  const energyContour = downsample(dbs, contourSize).map((db) => round(clamp((db + 60) / 60, 0, 1), 3));
  const pitchContour = downsampleNullable(f0Track, contourSize);
  if (duration > 1800) warnings.push("Only the measured statistics are shown; very long files are analysed in full but summarised.");

  return {
    durationSeconds: round(duration, 2),
    sampleRate,
    peakDb,
    rmsDb,
    medianF0,
    f0Min,
    f0Max,
    intonationRangeSemitones: intonationRange,
    voicedRatio,
    speechRateSyllablesPerMinute: speechRate,
    pauseCount: pauses.length,
    pauseRatio,
    meanPauseSeconds: pauses.length ? round(pauseSeconds / pauses.length, 2) : null,
    longestPauseSeconds: pauses.length ? round(Math.max(...pauses), 2) : null,
    loudnessRangeDb: loudnessRange,
    vibratoRateHz,
    vibratoExtentCents,
    energyContour,
    pitchContour,
    method: "On-device: Web Audio decode · 8 kHz analysis · energy gate, autocorrelation pitch (70–600 Hz), syllable-nuclei pacing proxy",
    warnings,
  };
}

function downsample(values: number[], size: number): number[] {
  if (!values.length) return [];
  const out: number[] = [];
  const step = values.length / size;
  for (let i = 0; i < size; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = start; j < end; j++) sum += values[j] ?? 0;
    out.push(sum / (end - start));
  }
  return out;
}

function downsampleNullable(values: (number | null)[], size: number): (number | null)[] {
  if (!values.length) return [];
  const out: (number | null)[] = [];
  const step = values.length / size;
  for (let i = 0; i < size; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    const window = values.slice(start, end).filter((value): value is number => value !== null);
    out.push(window.length ? round(window.reduce((a, b) => a + b, 0) / window.length, 1) : null);
  }
  return out;
}
