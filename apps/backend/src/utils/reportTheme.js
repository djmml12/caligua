// Paleta de colores derivada del logo Caligua Restaurant BBQ & Grill
// Rojo dominante, negro profundo, dorado de los cuernos

export const T = {
  // Logo Caligua
  RED:        "#CC1111",
  RED_DARK:   "#8B0000",
  RED_LIGHT:  "#FF4D4D",
  BLACK:      "#1A1A1A",
  GOLD:       "#C8A870",
  GOLD_LIGHT: "#F0DBA8",

  // Neutros
  WHITE:      "#FFFFFF",
  GRAY_LIGHT: "#F7F7F7",
  GRAY_MID:   "#E0E0E0",
  GRAY_TEXT:  "#555555",
  GRAY_DARK:  "#333333",

  // Semánticos
  SUCCESS:    "#166534",
  SUCCESS_BG: "#DCFCE7",
  WARNING:    "#A16207",
  WARNING_BG: "#FEF3C7",
  DANGER:     "#B91C1C",
  DANGER_BG:  "#FEE2E2",
};

// Secuencia de colores para series en gráficas (RGB para pngjs, hex para pdfkit)
export const SERIES_HEX = [
  T.RED, T.BLACK, T.GOLD, T.RED_DARK, "#FF8800", "#557700",
];

export const SERIES_RGB = [
  [204, 17,  17],
  [26,  26,  26],
  [200, 168, 112],
  [139, 0,   0],
  [255, 136, 0],
  [85,  119, 0],
];

export const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const fmtQ = (n) => `Q ${Number(n || 0).toFixed(2)}`;
