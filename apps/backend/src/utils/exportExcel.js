import ExcelJS from "exceljs";

export const exportToExcel = async (res, data, filename = "reporte") => {

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "POS System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Ventas por Cajero");

  /* ================= COLUMNAS ================= */

  worksheet.columns = [
    { header: "Cajero",        key: "cashier",          width: 25 },
    { header: "Ventas",        key: "total_sales",      width: 12 },
    { header: "Monto Vendido", key: "total_amount",     width: 18 },
    { header: "Propinas",      key: "total_tips",       width: 15 },
    { header: "Total Cobrado", key: "total_collected",  width: 18 },
  ];

  /* ================= HEADER ================= */

  const header = worksheet.getRow(1);

  header.font = { bold: true };

  header.alignment = {
    vertical: "middle",
    horizontal: "center"
  };

  header.eachCell(cell => {
    cell.border = {
      bottom: { style: "thin" }
    };
  });

  /* ================= AGREGAR FILAS ================= */

  let totalSales = 0;
  let totalAmount = 0;
  let totalTips = 0;
  let totalCollected = 0;

  data.forEach(row => {
    const amount    = Number(row.total_amount);
    const tips      = Number(row.total_tips);
    const collected = Number(row.total_collected ?? (amount + tips));

    worksheet.addRow({
      cashier:         row.cashier,
      total_sales:     row.total_sales,
      total_amount:    amount,
      total_tips:      tips,
      total_collected: collected,
    });

    totalSales     += Number(row.total_sales);
    totalAmount    += amount;
    totalTips      += tips;
    totalCollected += collected;
  });

  /* ================= FILA DE TOTALES ================= */

  const totalRow = worksheet.addRow({
    cashier:         "TOTAL",
    total_sales:     totalSales,
    total_amount:    totalAmount,
    total_tips:      totalTips,
    total_collected: totalCollected,
  });

  totalRow.font = { bold: true };

  totalRow.eachCell(cell => {
    cell.border = {
      top: { style: "thin" }
    };
  });

  /* ================= NOTA ================= */

  const noteRow = worksheet.addRow({ cashier: "* Las propinas son una cuenta aparte y no se incluyen en las utilidades." });
  noteRow.getCell("cashier").font = { italic: true, color: { argb: "FF6B7280" } };

  /* ================= FORMATO MONEDA ================= */

  worksheet.getColumn("total_amount").numFmt    = '"Q"#,##0.00';
  worksheet.getColumn("total_tips").numFmt      = '"Q"#,##0.00';
  worksheet.getColumn("total_collected").numFmt = '"Q"#,##0.00';

  /* ================= FILTRO ================= */

  worksheet.autoFilter = {
    from: "A1",
    to: "E1"
  };

  /* ================= CONGELAR HEADER ================= */

  worksheet.views = [
    { state: "frozen", ySplit: 1 }
  ];

  /* ================= DESCARGA ================= */

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${filename}.xlsx`
  );

  await workbook.xlsx.write(res);

  res.end();
};