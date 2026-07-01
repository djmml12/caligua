import PDFDocument from "pdfkit";
import {
  getInsumosService,
  getInsumoByIdService,
  createInsumoService,
  updateInsumoService,
  deleteInsumoService,
  registrarCompraService,
  getComprasService,
  ajustarStockService,
  getMovimientosService,
  getRecetaService,
  setRecetaService,
  getProductosConTipoService,
} from "../services/bodega.service.js";

const todayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const fmtQ = (n) => {
  const v = Number(n) || 0;
  return `Q ${Math.abs(v).toFixed(2)}`;
};

const buildBodegaExcelBuffer = async (rows) => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Caligua POS";

  const C = {
    BLACK:   "FF1A1A1A",
    RED:     "FFCC1111",
    WHITE:   "FFFFFFFF",
    GRAY:    "FFF7F7F7",
    CRIT_BG: "FFFEE2E2",
    LOW_BG:  "FFFEF3C7",
  };
  const headerFont = { bold: true, color: { argb: C.WHITE }, size: 10 };
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: C.BLACK } };

  const ws = wb.addWorksheet("Bodega");

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = "CALIGUA — Reporte de Bodega";
  ws.getCell("A1").font  = { bold: true, size: 14, color: { argb: C.WHITE } };
  ws.getCell("A1").fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C.RED } };
  ws.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = `Generado: ${new Date().toLocaleDateString("es-GT")}`;
  ws.getCell("A2").font  = { italic: true, size: 9, color: { argb: "FF666666" } };
  ws.getRow(2).height = 16;

  ws.columns = [
    { key: "nombre",         width: 28 },
    { key: "unidad_base",    width: 12 },
    { key: "stock_actual",   width: 12 },
    { key: "stock_min",      width: 12 },
    { key: "stock_critico",  width: 14 },
    { key: "costo_unitario", width: 14 },
    { key: "activo",         width: 10 },
  ];

  ws.getRow(4).values = ["Insumo", "Unidad", "Stock actual", "Stock mín.", "Stock crítico", "Costo unit.", "Activo"];
  ws.getRow(4).eachCell(cell => { cell.font = headerFont; cell.fill = headerFill; cell.alignment = { horizontal: "center" }; });
  ws.getRow(4).height = 20;

  rows.forEach((r, i) => {
    const stock = Number(r.stock_actual || 0);
    const bg = stock <= Number(r.stock_critico || 0) ? C.CRIT_BG
             : stock <= Number(r.stock_min      || 0) ? C.LOW_BG
             : i % 2 === 0 ? C.WHITE : C.GRAY;

    const row = ws.insertRow(5 + i, {
      nombre:         r.nombre,
      unidad_base:    r.unidad_base,
      stock_actual:   stock,
      stock_min:      Number(r.stock_min      || 0),
      stock_critico:  Number(r.stock_critico  || 0),
      costo_unitario: Number(r.costo_unitario || 0),
      activo:         r.activo ? "Sí" : "No",
    });
    row.eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }; });
    if (stock <= Number(r.stock_critico || 0)) {
      row.getCell("stock_actual").font = { bold: true, color: { argb: C.RED } };
    }
  });

  return wb.xlsx.writeBuffer();
};

const buildBodegaPdfBuffer = async (rows) => {
  return new Promise((resolve, reject) => {
    const PAD  = 40;
    const COL1 = 340;
    const COL2 = 80;
    const COL3 = 55;
    const ROW  = 18;
    const doc  = new PDFDocument({ size: "A4", margins: { top: PAD, left: PAD, right: PAD, bottom: PAD } });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW  = doc.page.width - PAD * 2;
    const issued = new Date().toLocaleDateString("es-GT");

    // ── Encabezado ────────────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#1A1A1A")
       .text("Inventario de bodega", PAD, PAD);
    doc.font("Helvetica").fontSize(9).fillColor("#888888")
       .text(`Caligua BBQ & Grill · ${issued}`, PAD, PAD + 18);
    doc.moveTo(PAD, PAD + 34).lineTo(PAD + pageW, PAD + 34).strokeColor("#DDDDDD").stroke();
    doc.y = PAD + 44;

    // ── Cabecera de tabla ─────────────────────────────────────────────────────
    const drawTableHeader = () => {
      doc.rect(PAD, doc.y, pageW, ROW + 2).fill("#1A1A1A");
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF")
         .text("Insumo",   PAD + 4,          doc.y + 5, { width: COL1 - 8, align: "left"  })
         .text("Unidad",   PAD + COL1,        doc.y - 8, { width: COL2,    align: "right" })
         .text("Cantidad", PAD + COL1 + COL2, doc.y - 8, { width: COL3,    align: "right" });
      doc.y += ROW + 2;
    };
    drawTableHeader();

    // ── Filas ─────────────────────────────────────────────────────────────────
    rows.forEach((r, i) => {
      if (doc.y > doc.page.height - PAD - ROW) {
        doc.addPage();
        doc.y = PAD;
        drawTableHeader();
      }
      const bg = i % 2 === 0 ? "#FFFFFF" : "#F7F7F7";
      doc.rect(PAD, doc.y, pageW, ROW).fill(bg);
      doc.font("Helvetica").fontSize(8).fillColor("#1A1A1A")
         .text(r.nombre || "",                        PAD + 4,          doc.y + 4, { width: COL1 - 8, align: "left"  })
         .text(r.unidad_base || "",                   PAD + COL1,       doc.y - 5, { width: COL2,    align: "right" })
         .text(String(Number(r.stock_actual || 0)),   PAD + COL1 + COL2, doc.y - 5, { width: COL3,    align: "right" });
      doc.y += ROW;
    });

    // ── Total ─────────────────────────────────────────────────────────────────
    doc.moveTo(PAD, doc.y).lineTo(PAD + pageW, doc.y).strokeColor("#DDDDDD").stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#1A1A1A")
       .text(`Total: ${rows.length} insumos`, PAD + 4, doc.y + 5);

    doc.end();
  });
};

// ── Insumos ───────────────────────────────────────────────────────────────────

export const getInsumos = async (req, res) => {
  try {
    res.json({ success: true, data: await getInsumosService() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const createInsumo = async (req, res) => {
  try {
    res.status(201).json({ success: true, data: await createInsumoService(req.body) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const updateInsumo = async (req, res) => {
  try {
    res.json({ success: true, data: await updateInsumoService(Number(req.params.id), req.body) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const deleteInsumo = async (req, res) => {
  try {
    await deleteInsumoService(Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// ── Compras ───────────────────────────────────────────────────────────────────

export const registrarCompra = async (req, res) => {
  try {
    const data = await registrarCompraService({ insumo_id: Number(req.params.id), ...req.body });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getCompras = async (req, res) => {
  try {
    res.json({ success: true, data: await getComprasService(req.params.id ? Number(req.params.id) : null) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Ajuste ────────────────────────────────────────────────────────────────────

export const ajustarStock = async (req, res) => {
  try {
    const { nueva_cantidad, notas } = req.body;
    const data = await ajustarStockService(Number(req.params.id), Number(nueva_cantidad), notas);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getMovimientos = async (req, res) => {
  try {
    res.json({ success: true, data: await getMovimientosService(Number(req.params.id)) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ── Recetas ───────────────────────────────────────────────────────────────────

export const getReceta = async (req, res) => {
  try {
    res.json({ success: true, data: await getRecetaService(Number(req.params.producto_id)) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const setReceta = async (req, res) => {
  try {
    await setRecetaService(Number(req.params.producto_id), req.body.ingredientes ?? []);
    res.json({ success: true, data: await getRecetaService(Number(req.params.producto_id)) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getProductosConTipo = async (req, res) => {
  try {
    res.json({ success: true, data: await getProductosConTipoService() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const exportBodega = async (req, res) => {
  try {
    const format   = String(req.query.format || "excel").toLowerCase();
    const rows     = await getInsumosService();
    const filename = `reporte_bodega_${todayString()}.${format === "pdf" ? "pdf" : "xlsx"}`;
    const encoded  = encodeURIComponent(filename);

    if (format === "pdf") {
      const buf = await buildBodegaPdfBuffer(rows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
      res.end(buf);
    } else {
      const buf = await buildBodegaExcelBuffer(rows);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
      res.end(buf);
    }
  } catch (e) {
    console.error("EXPORT BODEGA ERROR:", e);
    res.status(500).json({ success: false, message: e.message || "Error generando reporte de bodega" });
  }
};
