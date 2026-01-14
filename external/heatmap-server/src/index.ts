import {
  PORT,
  DIMENSION_X,
  DIMENSION_Y,
  BINARY_FILE_PATH,
  EMPTY_IMAGE_HEIGHT,
  EMPTY_IMAGE_WIDTH,
  EMPTY_MAP_IMAGE_PATH,
} from "./api/api-server";

const fs = require("fs");
const express = require("express");
const cors = require("cors");

const { createCanvas, loadImage } = require("canvas");

export const app = express();
app.use(cors());

let cachedBinaryData: Buffer | null = null;
const cachedHeatmapByPalette = new Map<string, Buffer>();
const heatmapInFlightByPalette = new Map<string, Promise<Buffer>>();

export const readBinaryFile = (filePath: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err: any, data: Buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

export const setColor = (temp: number) => {
  const celcius = (temp - 32) / 1.8;
  let color;

  if (celcius <= 0) {
    color = "blue";
  } else if (celcius > 0 && celcius < 10) {
    color = "lightblue";
  } else if (celcius >= 10 && celcius < 20) {
    color = "lime";
  } else if (celcius >= 20 && celcius < 30) {
    color = "yellow";
  } else if (celcius >= 30 && celcius < 40) {
    color = "orange";
  } else {
    color = "red";
  }

  return color;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const tempFToC = (tempF: number) => (tempF - 32) / 1.8;

type Palette = 'viridis' | 'turbo' | 'spectral';

const VIRIDIS_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0.0, rgb: [68, 1, 84] },
  { t: 0.1, rgb: [72, 40, 120] },
  { t: 0.2, rgb: [62, 74, 137] },
  { t: 0.35, rgb: [49, 104, 142] },
  { t: 0.5, rgb: [38, 130, 142] },
  { t: 0.65, rgb: [31, 158, 137] },
  { t: 0.78, rgb: [53, 183, 121] },
  { t: 0.88, rgb: [109, 205, 89] },
  { t: 0.95, rgb: [180, 222, 44] },
  { t: 1.0, rgb: [253, 231, 37] },
];

// Old look kept as an option.
const SPECTRAL_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0.0, rgb: [49, 54, 149] },
  { t: 0.2, rgb: [69, 117, 180] },
  { t: 0.4, rgb: [116, 173, 209] },
  { t: 0.55, rgb: [171, 221, 164] },
  { t: 0.7, rgb: [253, 174, 97] },
  { t: 0.85, rgb: [244, 109, 67] },
  { t: 1.0, rgb: [165, 0, 38] },
];

const rampFromStops = (
  stops: Array<{ t: number; rgb: [number, number, number] }>,
  t: number
): [number, number, number] => {
  const tt = clamp01(t);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (tt >= a.t && tt <= b.t) {
      const localT = (tt - a.t) / (b.t - a.t || 1);
      return [
        Math.round(lerp(a.rgb[0], b.rgb[0], localT)),
        Math.round(lerp(a.rgb[1], b.rgb[1], localT)),
        Math.round(lerp(a.rgb[2], b.rgb[2], localT)),
      ];
    }
  }
  return stops[stops.length - 1].rgb;
};

// Fast polynomial approximation (Google Turbo).
const turboColor = (t: number): [number, number, number] => {
  const x = clamp01(t);
  const r = 34.61 + x * (1172.33 + x * (-10793.56 + x * (33300.12 + x * (-38394.49 + x * 14825.05))));
  const g = 23.31 + x * (557.33 + x * (1225.33 + x * (-3574.96 + x * (1501.88 + x * 0.00))));
  const b = 27.2 + x * (3211.1 + x * (-15327.97 + x * (27814.0 + x * (-22569.18 + x * 6838.66))));
  return [
    Math.round(clamp(r, 0, 255)),
    Math.round(clamp(g, 0, 255)),
    Math.round(clamp(b, 0, 255)),
  ];
};

const paletteColor = (palette: Palette, t: number): [number, number, number] => {
  switch (palette) {
    case 'turbo':
      return turboColor(t);
    case 'spectral':
      return rampFromStops(SPECTRAL_STOPS, t);
    case 'viridis':
    default:
      return rampFromStops(VIRIDIS_STOPS, t);
  }
};

const tempToRgbSmooth = (tempF: number, palette: Palette): [number, number, number] => {
  // Sea-surface temperature typically ~[-2, 35] °C.
  const c = tempFToC(tempF);
  const t = (c - -2) / (35 - -2);
  return paletteColor(palette, t);
};

const parsePalette = (value: unknown): Palette => {
  if (value === 'turbo' || value === 'spectral' || value === 'viridis') return value;
  return 'viridis';
};

const getBinaryData = async (): Promise<Buffer> => {
  if (cachedBinaryData) return cachedBinaryData;
  cachedBinaryData = await readBinaryFile(BINARY_FILE_PATH);
  return cachedBinaryData;
};

const generateHeatMap = async (binaryData: Buffer, palette: Palette) => {
  const canvas = createCanvas(EMPTY_IMAGE_WIDTH, EMPTY_IMAGE_HEIGHT);
  const ctx = canvas.getContext("2d");

  try {
    const image = await loadImage(EMPTY_MAP_IMAGE_PATH);
    ctx.drawImage(image, 0, 0, EMPTY_IMAGE_WIDTH, EMPTY_IMAGE_HEIGHT);

    // The grid is 36,000 x 17,999 (~648M cells). Rendering every cell is far too slow.
    // Downsample to the output resolution (3600 x 1800) by sampling the grid per output pixel.
    const tempArr = new Int8Array(binaryData);
    const scaleX = DIMENSION_X / EMPTY_IMAGE_WIDTH;
    const scaleY = DIMENSION_Y / EMPTY_IMAGE_HEIGHT;

    const imgData = ctx.getImageData(0, 0, EMPTY_IMAGE_WIDTH, EMPTY_IMAGE_HEIGHT);
    const data = imgData.data;

    const alpha = 0.65;

    for (let y = 0; y < EMPTY_IMAGE_HEIGHT; y++) {
      const baseY = Math.min(
        DIMENSION_Y - 1,
        Math.floor((EMPTY_IMAGE_HEIGHT - 1 - y) * scaleY)
      );

      for (let x = 0; x < EMPTY_IMAGE_WIDTH; x++) {
        const baseX = Math.min(DIMENSION_X - 1, Math.floor(x * scaleX));

        // 2x2 box sample to reduce aliasing.
        let sum = 0;
        let count = 0;
        for (let dy = 0; dy <= 1; dy++) {
          const srcY = baseY + dy;
          if (srcY >= DIMENSION_Y) continue;
          for (let dx = 0; dx <= 1; dx++) {
            const srcX = baseX + dx;
            if (srcX >= DIMENSION_X) continue;
            const v = tempArr[srcY * DIMENSION_X + srcX];
            if (v === -1) continue;
            sum += v;
            count += 1;
          }
        }

        if (count === 0) continue;

        const tempAvgF = sum / count;
        const [r, g, b] = tempToRgbSmooth(tempAvgF, palette);

        const idx = (y * EMPTY_IMAGE_WIDTH + x) * 4;
        const br = data[idx];
        const bg = data[idx + 1];
        const bb = data[idx + 2];

        data[idx] = Math.round(lerp(br, r, alpha));
        data[idx + 1] = Math.round(lerp(bg, g, alpha));
        data[idx + 2] = Math.round(lerp(bb, b, alpha));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const buf = canvas.toBuffer("image/jpeg");

    return buf;
  } catch (error) {
    throw error;
  }
};

app.get("/api/data", async (req: any, res: any) => {
  try {
    const refresh = req.query?.refresh === "1";
    const palette = parsePalette(req.query?.palette);
    const cacheKey = palette;

    const cached = cachedHeatmapByPalette.get(cacheKey);
    if (!refresh && cached) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      return res.send(cached);
    }

    if (!heatmapInFlightByPalette.has(cacheKey)) {
      const promise = (async () => {
        const binaryData = await getBinaryData();
        const bufferHeatMap = await generateHeatMap(binaryData, palette);
        cachedHeatmapByPalette.set(cacheKey, bufferHeatMap);
        return bufferHeatMap;
      })().finally(() => {
        heatmapInFlightByPalette.delete(cacheKey);
      });

      heatmapInFlightByPalette.set(cacheKey, promise);
    }

    const bufferHeatMap = await heatmapInFlightByPalette.get(cacheKey);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(bufferHeatMap);
  } catch (error) {
    console.log(error);
    res.status(500).send(`Error: ${error}`);
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
