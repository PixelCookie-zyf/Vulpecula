export type SnapConfig = {
  kColors?: number;
  pixelSizeOverride?: number;
};

export type SnapResult = {
  imageData: ImageData;
  pixelSize: number;
  gridWidth: number;
  gridHeight: number;
};

type SnapInternalConfig = Required<Omit<SnapConfig, "pixelSizeOverride">> & {
  kSeed: number;
  maxKmeansIterations: number;
  peakThresholdMultiplier: number;
  peakDistanceFilter: number;
  walkerSearchWindowRatio: number;
  walkerMinSearchWindow: number;
  walkerStrengthThreshold: number;
  minCutsPerAxis: number;
  fallbackTargetSegments: number;
  maxStepRatio: number;
};

const DEFAULT_CONFIG: SnapInternalConfig = {
  kColors: 16,
  kSeed: 42,
  maxKmeansIterations: 15,
  peakThresholdMultiplier: 0.2,
  peakDistanceFilter: 4,
  walkerSearchWindowRatio: 0.35,
  walkerMinSearchWindow: 2.0,
  walkerStrengthThreshold: 0.5,
  minCutsPerAxis: 4,
  fallbackTargetSegments: 64,
  maxStepRatio: 1.8,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distSq(p: [number, number, number], c: [number, number, number]) {
  const dr = p[0] - c[0];
  const dg = p[1] - c[1];
  const db = p[2] - c[2];
  return dr * dr + dg * dg + db * db;
}

function quantizeImage(img: ImageData, kColors: number, kSeed: number, maxIterations: number) {
  const { data, width, height } = img;
  const opaque: Array<[number, number, number]> = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) opaque.push([data[i], data[i + 1], data[i + 2]]);
  }
  const out = new ImageData(width, height);
  out.data.set(data);
  if (opaque.length === 0) return out;

  const rng = mulberry32(kSeed);
  const k = Math.min(kColors, opaque.length);
  const centroids: Array<[number, number, number]> = [opaque[Math.floor(rng() * opaque.length)]];
  const distances = new Float32Array(opaque.length).fill(3.4e38);

  for (let c = 1; c < k; c++) {
    const last = centroids[centroids.length - 1];
    let sumSq = 0;
    for (let i = 0; i < opaque.length; i++) {
      const d = distSq(opaque[i], last);
      if (d < distances[i]) distances[i] = d;
      sumSq += distances[i];
    }
    if (sumSq <= 0) {
      centroids.push(opaque[Math.floor(rng() * opaque.length)]);
    } else {
      let r = rng() * sumSq;
      let idx = 0;
      for (let i = 0; i < opaque.length; i++) {
        r -= distances[i];
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      centroids.push(opaque[idx]);
    }
  }

  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);
  let prev = centroids.map((c) => [...c] as [number, number, number]);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < opaque.length; i++) {
      let minDist = 3.4e38;
      let best = 0;
      for (let j = 0; j < centroids.length; j++) {
        const d = distSq(opaque[i], centroids[j]);
        if (d < minDist) {
          minDist = d;
          best = j;
        }
      }
      sums[best * 3] += opaque[i][0];
      sums[best * 3 + 1] += opaque[i][1];
      sums[best * 3 + 2] += opaque[i][2];
      counts[best]++;
    }
    for (let j = 0; j < centroids.length; j++) {
      if (counts[j] > 0) {
        centroids[j] = [sums[j * 3] / counts[j], sums[j * 3 + 1] / counts[j], sums[j * 3 + 2] / counts[j]];
      }
    }
    if (iteration > 0) {
      let maxMovement = 0;
      for (let j = 0; j < centroids.length; j++) {
        const movement = distSq(centroids[j], prev[j]);
        if (movement > maxMovement) maxMovement = movement;
      }
      if (maxMovement < 0.01) break;
    }
    prev = centroids.map((c) => [...c] as [number, number, number]);
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const p: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
    let minDist = 3.4e38;
    let best: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
    for (const c of centroids) {
      const d = distSq(p, c);
      if (d < minDist) {
        minDist = d;
        best = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
      }
    }
    out.data[i] = best[0];
    out.data[i + 1] = best[1];
    out.data[i + 2] = best[2];
  }
  return out;
}

function computeProfiles(img: ImageData) {
  const { width: w, height: h, data } = img;
  const gray = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] === 0) return 0;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  const colProj = new Float64Array(w);
  const rowProj = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w - 1; x++) {
      colProj[x] += Math.abs(gray(x + 1, y) - gray(x - 1, y));
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h - 1; y++) {
      rowProj[y] += Math.abs(gray(x, y + 1) - gray(x, y - 1));
    }
  }
  return { colProj: Array.from(colProj), rowProj: Array.from(rowProj) };
}

function estimateStepSize(profile: number[], cfg: SnapInternalConfig): number | null {
  if (profile.length === 0) return null;
  const maxVal = Math.max(...profile);
  if (maxVal === 0) return null;
  const threshold = maxVal * cfg.peakThresholdMultiplier;

  const peaks: number[] = [];
  for (let i = 1; i < profile.length - 1; i++) {
    if (profile[i] > threshold && profile[i] > profile[i - 1] && profile[i] > profile[i + 1]) {
      peaks.push(i);
    }
  }
  if (peaks.length < 2) return null;

  const clean = [peaks[0]];
  for (const p of peaks.slice(1)) {
    if (p - clean[clean.length - 1] > cfg.peakDistanceFilter - 1) clean.push(p);
  }
  if (clean.length < 2) return null;

  const diffs = clean.slice(1).map((p, i) => p - clean[i]).sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function resolveStepSizes(
  stepX: number | null,
  stepY: number | null,
  width: number,
  height: number,
  cfg: SnapInternalConfig,
  pixelSizeOverride?: number,
): [number, number] {
  if (pixelSizeOverride !== undefined) return [pixelSizeOverride, pixelSizeOverride];
  if (stepX !== null && stepY !== null) {
    const ratio = Math.max(stepX, stepY) / Math.min(stepX, stepY);
    if (ratio > cfg.maxStepRatio) {
      const smaller = Math.min(stepX, stepY);
      return [smaller, smaller];
    }
    const avg = (stepX + stepY) / 2;
    return [avg, avg];
  }
  if (stepX !== null) return [stepX, stepX];
  if (stepY !== null) return [stepY, stepY];
  const fallback = Math.max(Math.min(width, height) / cfg.fallbackTargetSegments, 1);
  return [fallback, fallback];
}

function walk(profile: number[], stepSize: number, limit: number, cfg: SnapInternalConfig): number[] {
  const cuts = [0];
  let currentPos = 0;
  const searchWindow = Math.max(stepSize * cfg.walkerSearchWindowRatio, cfg.walkerMinSearchWindow);
  const meanVal = profile.reduce((a, b) => a + b, 0) / profile.length;

  while (currentPos < limit) {
    const target = currentPos + stepSize;
    if (target >= limit) {
      cuts.push(limit);
      break;
    }
    const startSearch = Math.max(Math.floor(target - searchWindow), Math.floor(currentPos + 1));
    const endSearch = Math.min(Math.floor(target + searchWindow), limit);
    if (endSearch <= startSearch) {
      currentPos = target;
      continue;
    }
    let maxVal = -1;
    let maxIdx = startSearch;
    for (let i = startSearch; i < endSearch; i++) {
      if (profile[i] > maxVal) {
        maxVal = profile[i];
        maxIdx = i;
      }
    }
    if (maxVal > meanVal * cfg.walkerStrengthThreshold) {
      cuts.push(maxIdx);
      currentPos = maxIdx;
    } else {
      cuts.push(Math.floor(target));
      currentPos = target;
    }
  }
  return cuts;
}

function sanitizeCuts(cuts: number[], limit: number): number[] {
  if (limit === 0) return [0];
  const set = new Set<number>();
  for (const value of cuts) set.add(value >= limit ? limit : value);
  set.add(0);
  set.add(limit);
  return [...set].sort((a, b) => a - b);
}

function snapUniformCuts(
  profile: number[],
  limit: number,
  targetStep: number,
  cfg: SnapInternalConfig,
  minRequired: number,
): number[] {
  if (limit === 0) return [0];
  if (limit === 1) return [0, 1];
  let desiredCells = Number.isFinite(targetStep) && targetStep > 0 ? Math.round(limit / targetStep) : 0;
  desiredCells = Math.max(Math.max(desiredCells, minRequired - 1), 1, 0);
  desiredCells = Math.min(desiredCells, limit);

  const cellWidth = limit / desiredCells;
  const searchWindow = Math.max(cellWidth * cfg.walkerSearchWindowRatio, cfg.walkerMinSearchWindow);
  const meanVal = profile.reduce((a, b) => a + b, 0) / Math.max(profile.length, 1);

  const cuts: number[] = [0];
  for (let idx = 1; idx < desiredCells; idx++) {
    const target = cellWidth * idx;
    const prev = cuts[cuts.length - 1];
    if (prev + 1 >= limit) break;
    let start = Math.max(Math.floor(target - searchWindow), prev + 1, 0);
    let end = Math.min(Math.ceil(target + searchWindow), limit - 1);
    if (end < start) {
      start = prev + 1;
      end = start;
    }
    let bestIdx = Math.min(start, profile.length - 1);
    let bestVal = -1;
    for (let i = start; i <= Math.min(end, profile.length - 1); i++) {
      const v = profile[i] ?? 0;
      if (v > bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    }
    if (bestVal < meanVal * cfg.walkerStrengthThreshold) {
      let fallback = Math.round(target);
      if (fallback <= prev) fallback = prev + 1;
      if (fallback >= limit) fallback = Math.max(limit - 1, prev + 1);
      bestIdx = fallback;
    }
    cuts.push(bestIdx);
  }
  if (cuts[cuts.length - 1] !== limit) cuts.push(limit);
  return sanitizeCuts(cuts, limit);
}

function stabilizeCuts(
  profile: number[],
  cuts: number[],
  limit: number,
  siblingCuts: number[],
  siblingLimit: number,
  cfg: SnapInternalConfig,
): number[] {
  if (limit === 0) return [0];
  const sanitized = sanitizeCuts(cuts, limit);
  const minRequired = Math.max(Math.min(cfg.minCutsPerAxis, limit + 1), 2);
  const axisCells = Math.max(sanitized.length - 1, 0);
  const siblingCells = Math.max(siblingCuts.length - 1, 0);
  const siblingHasGrid = siblingLimit > 0 && siblingCells >= Math.max(minRequired - 1, 1) && siblingCells > 0;
  const stepsSkewed =
    siblingHasGrid &&
    axisCells > 0 &&
    (() => {
      const axisStep = limit / axisCells;
      const siblingStep = siblingLimit / siblingCells;
      const ratio = axisStep / siblingStep;
      return ratio > cfg.maxStepRatio || ratio < 1 / cfg.maxStepRatio;
    })();
  if (sanitized.length >= minRequired && !stepsSkewed) return sanitized;

  let targetStep = siblingHasGrid
    ? siblingLimit / siblingCells
    : cfg.fallbackTargetSegments > 1
      ? limit / cfg.fallbackTargetSegments
      : axisCells > 0
        ? limit / axisCells
        : limit;
  if (!Number.isFinite(targetStep) || targetStep <= 0) targetStep = 1;
  return snapUniformCuts(profile, limit, targetStep, cfg, minRequired);
}

function stabilizeBothAxes(
  profileX: number[],
  profileY: number[],
  rawColCuts: number[],
  rawRowCuts: number[],
  width: number,
  height: number,
  cfg: SnapInternalConfig,
): [number[], number[]] {
  const colPass1 = stabilizeCuts(profileX, rawColCuts, width, rawRowCuts, height, cfg);
  const rowPass1 = stabilizeCuts(profileY, rawRowCuts, height, rawColCuts, width, cfg);

  const colCells = Math.max(colPass1.length - 1, 1);
  const rowCells = Math.max(rowPass1.length - 1, 1);
  const colStep = width / colCells;
  const rowStep = height / rowCells;
  const stepRatio = Math.max(colStep, rowStep) / Math.min(colStep, rowStep);

  if (stepRatio > cfg.maxStepRatio) {
    const target = Math.min(colStep, rowStep);
    const finalCol = colStep > target * 1.2
      ? snapUniformCuts(profileX, width, target, cfg, Math.max(cfg.minCutsPerAxis, 2))
      : colPass1;
    const finalRow = rowStep > target * 1.2
      ? snapUniformCuts(profileY, height, target, cfg, Math.max(cfg.minCutsPerAxis, 2))
      : rowPass1;
    return [finalCol, finalRow];
  }
  return [colPass1, rowPass1];
}

function resample(img: ImageData, cols: number[], rows: number[]): ImageData {
  const outW = Math.max(cols.length - 1, 1);
  const outH = Math.max(rows.length - 1, 1);
  const out = new ImageData(outW, outH);
  const src = img.data;
  const sw = img.width;

  for (let y = 0; y < rows.length - 1; y++) {
    const ys = rows[y];
    const ye = rows[y + 1];
    for (let x = 0; x < cols.length - 1; x++) {
      const xs = cols[x];
      const xe = cols[x + 1];
      if (xe <= xs || ye <= ys) continue;
      const counts = new Map<number, number>();
      for (let py = ys; py < ye; py++) {
        for (let px = xs; px < xe; px++) {
          if (px < sw && py < img.height) {
            const i = (py * sw + px) * 4;
            const key = (src[i] << 24) | (src[i + 1] << 16) | (src[i + 2] << 8) | src[i + 3];
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
      }
      let bestKey = 0;
      let bestCount = -1;
      for (const [key, count] of counts) {
        if (count > bestCount || (count === bestCount && key < bestKey)) {
          bestKey = key;
          bestCount = count;
        }
      }
      const o = (y * outW + x) * 4;
      out.data[o] = (bestKey >>> 24) & 255;
      out.data[o + 1] = (bestKey >>> 16) & 255;
      out.data[o + 2] = (bestKey >>> 8) & 255;
      out.data[o + 3] = bestKey & 255;
    }
  }
  return out;
}

export function snapPixels(imageData: ImageData, config: SnapConfig = {}): SnapResult {
  const cfg: SnapInternalConfig = {
    ...DEFAULT_CONFIG,
    ...(config.kColors !== undefined ? { kColors: config.kColors } : null),
  };
  const { width, height } = imageData;
  if (width < 3 || height < 3) throw new Error("Image too small (minimum 3x3)");

  const override = config.pixelSizeOverride;
  if (override !== undefined && (override < 1 || override > Math.min(width, height) / 2)) {
    throw new Error(`Pixel size must be between 1 and ${Math.floor(Math.min(width, height) / 2)}`);
  }

  const analysis = config.kColors === 0
    ? imageData
    : quantizeImage(imageData, cfg.kColors, cfg.kSeed, cfg.maxKmeansIterations);
  const { colProj, rowProj } = computeProfiles(analysis);

  const stepXOpt = estimateStepSize(colProj, cfg);
  const stepYOpt = estimateStepSize(rowProj, cfg);
  const [stepX, stepY] = resolveStepSizes(stepXOpt, stepYOpt, width, height, cfg, override);

  const rawCols = walk(colProj, stepX, width, cfg);
  const rawRows = walk(rowProj, stepY, height, cfg);
  const [colCuts, rowCuts] = stabilizeBothAxes(colProj, rowProj, rawCols, rawRows, width, height, cfg);

  const snapped = resample(analysis, colCuts, rowCuts);
  return {
    imageData: snapped,
    pixelSize: stepX,
    gridWidth: Math.max(colCuts.length - 1, 1),
    gridHeight: Math.max(rowCuts.length - 1, 1),
  };
}
