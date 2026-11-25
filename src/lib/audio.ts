/**
 * Local vocal analysis.
 *
 * Decodes the uploaded track in the browser and measures real signal
 * properties: level, an autocorrelation pitch track, vibrato modulation and an
 * energy contour. This is analysis, not animation — it gives the performance
 * workspace honest timing and pitch data to hand to a lip-sync provider later.
 */
import type { AudioAnalysis } from "../../shared/types";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const round = (v: number, digits = 3) => Number(v.toFixed(digits));

export async function analyzeAudioBlob(blob: Blob): Promise<AudioAnalysis> {
  const buffer = await blob.arrayBuffer();
  const AudioCtor: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioCtor) throw new Error("This browser does not support the Web Audio API.");
  const ctx = new AudioCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buffer.slice(0));
  } finally {
    void ctx.close();
  }

  const sampleRate = decoded.sampleRate;
  const duration = decoded.duration;
  const channels = decoded.numberOfChannels;
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < channels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / channels;
  }

  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < mono.length; i++) {
    const v = mono[i];
    peak = Math.max(peak, Math.abs(v));
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, mono.length));
  const peakDb = round(20 * Math.log10(peak || 1e-6), 1);
  const rmsDb = round(20 * Math.log10(rms || 1e-6), 1);

  // Analysis signal: decimate to ~16 kHz for a tractable pitch search.
  const targetRate = 16000;
  const decimation = Math.max(1, Math.round(sampleRate / targetRate));
  const rate = sampleRate / decimation;
  const down = new Float32Array(Math.floor(mono.length / decimation));
  for (let i = 0; i < down.length; i++) {
    let acc = 0;
    for (let j = 0; j < decimation; j++) acc += mono[i * decimation + j] ?? 0;
    down[i] = acc / decimation;
  }

  const frameSize = Math.round(rate * 0.04); // 40 ms
  const hop = Math.round(rate * 0.02); // 20 ms
  const minLag = Math.floor(rate / 1000);
  const maxLag = Math.floor(rate / 60);
  const frameCount = Math.max(1, Math.floor((down.length - frameSize) / hop));

  const energy: number[] = [];
  const pitch: (number | null)[] = [];
  const gate = Math.max(0.004, rms * 0.35);

  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    let frameRms = 0;
    for (let i = 0; i < frameSize; i++) {
      const v = down[start + i] ?? 0;
      frameRms += v * v;
    }
    frameRms = Math.sqrt(frameRms / frameSize);
    energy.push(frameRms);

    if (frameRms < gate) {
      pitch.push(null);
      continue;
    }

    // Normalised autocorrelation peak within the human voice band.
    let bestLag = -1;
    let bestScore = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < frameSize; i += 2) {
        const a = down[start + i] ?? 0;
        const b = down[start + i + lag] ?? 0;
        corr += a * b;
        normA += a * a;
        normB += b * b;
      }
      const denom = Math.sqrt(normA * normB) || 1;
      const score = corr / denom;
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestLag > 0 && bestScore > 0.45) {
      pitch.push(rate / bestLag);
    } else {
      pitch.push(null);
    }
  }

  const voiced = pitch.filter((v): v is number => v !== null && v > 60 && v < 1100).sort((a, b) => a - b);
  const medianF0 = voiced.length ? round(voiced[Math.floor(voiced.length / 2)], 1) : null;
  const f0Min = voiced.length ? round(voiced[Math.floor(voiced.length * 0.05)], 1) : null;
  const f0Max = voiced.length ? round(voiced[Math.floor(voiced.length * 0.95)], 1) : null;
  const voicedRatio = round(voiced.length / Math.max(1, pitch.length), 3);

  let vibratoRateHz: number | null = null;
  let vibratoExtentCents: number | null = null;
  if (medianF0 && voiced.length > 30) {
    const series: number[] = [];
    for (let i = 0; i < pitch.length; i++) {
      const v = pitch[i];
      if (v === null) continue;
      const window: number[] = [];
      for (let j = i - 4; j <= i + 4; j++) {
        const w = pitch[j];
        if (w !== null) window.push(w);
      }
      const smooth = window.reduce((a, b) => a + b, 0) / Math.max(1, window.length);
      series.push(1200 * Math.log2(v / Math.max(1, smooth)));
    }
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const residual = series.map((v) => v - mean);
    let crossings = 0;
    for (let i = 1; i < residual.length; i++) {
      if ((residual[i - 1] < 0 && residual[i] >= 0) || (residual[i - 1] >= 0 && residual[i] < 0)) crossings++;
    }
    const seconds = residual.length * (hop / rate);
    if (seconds > 0.5) {
      vibratoRateHz = round(crossings / 2 / seconds, 2);
      const rmsCents = Math.sqrt(residual.reduce((a, b) => a + b * b, 0) / residual.length);
      vibratoExtentCents = round(rmsCents, 1);
      if (vibratoRateHz < 3 || vibratoRateHz > 10) {
        vibratoRateHz = null;
        vibratoExtentCents = null;
      }
    }
  }

  const contourLength = 200;
  const energyContour = downsample(energy, contourLength).map((v) => round(v / Math.max(0.0001, Math.max(...energy)), 3));
  const pitchContour = downsampleMixed(pitch, contourLength);

  return {
    sampleRate,
    durationSeconds: round(duration, 2),
    peakDb,
    rmsDb,
    medianF0,
    f0Min,
    f0Max,
    voicedRatio,
    vibratoRateHz,
    vibratoExtentCents,
    energyContour,
    pitchContour,
    frameSeconds: round(hop / rate, 4),
    method: "On-device: autocorrelation pitch track (60–1000 Hz), 40 ms frames · Web Audio",
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

function downsampleMixed(values: (number | null)[], size: number): (number | null)[] {
  if (!values.length) return [];
  const out: (number | null)[] = [];
  const step = values.length / size;
  for (let i = 0; i < size; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    const window = values.slice(start, end).filter((v): v is number => v !== null);
    out.push(window.length ? round(window.reduce((a, b) => a + b, 0) / window.length, 1) : null);
  }
  return out;
}

export function pitchRangeSemitones(analysis: AudioAnalysis): number | null {
  if (!analysis.f0Min || !analysis.f0Max) return null;
  return round(12 * Math.log2(analysis.f0Max / analysis.f0Min), 1);
}
