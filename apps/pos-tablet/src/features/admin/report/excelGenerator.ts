/**
 * excelGenerator.ts — Genera reportes Excel Caligua usando SheetJS (xlsx).
 *
 * 3 hojas: Resumen (KPIs + agregados), Detalle (ventas), Datos (raw para análisis).
 * Nota: SheetJS no soporta gráficos embebidos sin librerías Pro de pago,
 * por lo que las gráficas viven en el PDF y aquí incluimos las tablas y KPIs
 * con formato/colores de marca.
 */

import * as XLSX from "xlsx";
import { fmtQ } from "./theme";
import type { RangeReportInput } from "./pdfGenerator";

const sheetName = (s: string) => s.slice(0, 31);

export function generateRangeReportXLSX(input: RangeReportInput): Blob {
  const { label, from, to, kpi, sales, salesByDay, salesBySeller, topProducts = [] } = input;

  const totalCobrado = kpi.total_sales + kpi.total_tips;
  const totalTips    = sales.reduce((a, s) => a + s.tip, 0);
  const totalSold    = sales.reduce((a, s) => a + s.total, 0);

  // ── Hoja 1: Resumen ─────────────────────────────────────────────────────────
  const resAOA: Array<Array<string | number>> = [
    ["CALIGUA — Reporte " + label.toUpperCase()],
    ["Período", `${from}  →  ${to}`],
    [],
    ["INDICADORES"],
    ["Ventas registradas", sales.length],
    ["Total vendido",      Number(kpi.total_sales.toFixed(2))],
    ["Total propinas",     Number(kpi.total_tips.toFixed(2))],
    ["Total cobrado",      Number(totalCobrado.toFixed(2))],
    ["Ticket promedio",    Number(kpi.avg_ticket.toFixed(2))],
    ["Utilidad",           Number(kpi.total_profit.toFixed(2))],
    [],
  ];

  if (kpi.top_product) {
    resAOA.push(["Producto estrella", `${kpi.top_product.name} (${kpi.top_product.units} unidades)`]);
  }
  if (kpi.top_seller) {
    resAOA.push(["Mejor vendedor", `${kpi.top_seller.name} — ${fmtQ(kpi.top_seller.total_sold)}`]);
  }
  resAOA.push([]);

  if (salesByDay.length > 0) {
    resAOA.push(["VENTAS POR DÍA"]);
    resAOA.push(["Día", "Total"]);
    salesByDay.forEach((p) => resAOA.push([p.label, Number(p.value.toFixed(2))]));
    resAOA.push([]);
  }

  if (salesBySeller.length > 0) {
    resAOA.push(["VENTAS POR VENDEDOR"]);
    resAOA.push(["Vendedor", "Total"]);
    salesBySeller.forEach((p) => resAOA.push([p.label, Number(p.value.toFixed(2))]));
    resAOA.push([]);
  }

  if (topProducts.length > 0) {
    resAOA.push(["TOP PRODUCTOS"]);
    resAOA.push(["Producto", "Unidades"]);
    topProducts.forEach((p) => resAOA.push([p.label, p.value]));
  }

  const wsRes = XLSX.utils.aoa_to_sheet(resAOA);
  wsRes["!cols"] = [{ wch: 28 }, { wch: 22 }];
  // Combinar título
  wsRes["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
  ];

  // ── Hoja 2: Detalle ─────────────────────────────────────────────────────────
  const detHeader = ["Venta #", "Vendedor", "Fecha", "Propina", "Total vendido", "Total cobrado"];
  const detBody = sales.map((s) => [
    `#${s.id}`,
    s.seller || "N/A",
    s.date,
    Number(s.tip.toFixed(2)),
    Number(s.total.toFixed(2)),
    Number((s.total + s.tip).toFixed(2)),
  ]);
  const detFooter = ["", "TOTAL", "", Number(totalTips.toFixed(2)), Number(totalSold.toFixed(2)), Number((totalSold + totalTips).toFixed(2))];

  const wsDet = XLSX.utils.aoa_to_sheet([detHeader, ...detBody, detFooter]);
  wsDet["!cols"] = [
    { wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
  ];
  // Freeze header row + autofilter
  wsDet["!freeze"] = { xSplit: 0, ySplit: 1 };
  wsDet["!autofilter"] = { ref: `A1:F${detBody.length + 1}` };

  // Aplicar formato moneda a columnas D-F
  const range = XLSX.utils.decode_range(wsDet["!ref"] as string);
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of [3, 4, 5]) {
      const cell = wsDet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell) cell.z = '"Q"#,##0.00';
    }
  }

  // ── Hoja 3: Datos (raw) ─────────────────────────────────────────────────────
  const datosHeader = ["sale_id", "seller", "date", "total", "tip", "collected"];
  const datosBody = sales.map((s) => [
    s.id, s.seller, s.date, s.total, s.tip, s.total + s.tip,
  ]);
  const wsData = XLSX.utils.aoa_to_sheet([datosHeader, ...datosBody]);
  wsData["!cols"] = [
    { wch: 10 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
  ];
  wsData["!freeze"] = { xSplit: 0, ySplit: 1 };
  wsData["!autofilter"] = { ref: `A1:F${datosBody.length + 1}` };

  // ── Workbook ────────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRes,  sheetName("Resumen"));
  XLSX.utils.book_append_sheet(wb, wsDet,  sheetName("Detalle"));
  XLSX.utils.book_append_sheet(wb, wsData, sheetName("Datos"));

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
