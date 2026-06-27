// Paleta Caligua — derivada del logo (rojo, negro, dorado de los cuernos)

export const T = {
  RED:        "#CC1111",
  RED_DARK:   "#8B0000",
  RED_LIGHT:  "#FF4D4D",
  BLACK:      "#1A1A1A",
  GOLD:       "#C8A870",
  GOLD_LIGHT: "#F0DBA8",
  WHITE:      "#FFFFFF",
  GRAY_LIGHT: "#F7F7F7",
  GRAY_MID:   "#E0E0E0",
  GRAY_TEXT:  "#555555",
  GRAY_DARK:  "#333333",
  SUCCESS:    "#166534",
  SUCCESS_BG: "#DCFCE7",
  WARNING:    "#A16207",
  WARNING_BG: "#FEF3C7",
  DANGER:     "#B91C1C",
  DANGER_BG:  "#FEE2E2",
} as const;

export const SERIES_HEX = [
  T.RED, T.BLACK, T.GOLD, T.RED_DARK, "#FF8800", "#557700",
] as const;

export const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const fmtQ = (n: number) => `Q ${Number(n || 0).toFixed(2)}`;

export const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
