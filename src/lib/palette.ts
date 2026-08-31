import type { PaletteName } from "../types";

type Rgb = [number, number, number];

const PALETTES: Record<PaletteName, Rgb[]> = {
  cividis: [
    [0, 34, 78],
    [40, 70, 107],
    [83, 95, 108],
    [123, 122, 109],
    [166, 153, 97],
    [213, 192, 69],
    [253, 234, 69],
  ],
  viridis: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
  magma: [
    [0, 0, 4],
    [77, 18, 123],
    [182, 54, 121],
    [251, 140, 60],
    [252, 253, 191],
  ],
  "blue-orange": [
    [7, 63, 114],
    [42, 120, 142],
    [126, 173, 157],
    [232, 216, 166],
    [224, 142, 69],
    [168, 55, 45],
  ],
};

export function paletteColor(palette: PaletteName, rawRatio: number): string {
  const colors = PALETTES[palette];
  const ratio = Math.max(0, Math.min(1, rawRatio));
  const position = ratio * (colors.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(colors.length - 1, Math.ceil(position));
  const weight = position - lowerIndex;
  const lower = colors[lowerIndex] ?? colors[0] ?? [0, 0, 0];
  const upper = colors[upperIndex] ?? lower;
  const red = Math.round(lower[0] * (1 - weight) + upper[0] * weight);
  const green = Math.round(lower[1] * (1 - weight) + upper[1] * weight);
  const blue = Math.round(lower[2] * (1 - weight) + upper[2] * weight);
  return `rgb(${red} ${green} ${blue})`;
}

export function paletteStops(palette: PaletteName, count = 32): string[] {
  return Array.from({ length: count }, (_, index) =>
    paletteColor(palette, index / (count - 1)),
  );
}
