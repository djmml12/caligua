import PDFDocument from 'pdfkit';

export const exportToPdf = (res, data, title) => {
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${title}.pdf"`
  );

  doc.pipe(res);

  doc.fontSize(18).text(title, { align: 'center' });
  doc.moveDown();

  data.forEach(row => {
    doc
      .fontSize(12)
      .text(
        `Cajero: ${row.cashier} | Ventas: ${row.total_sales} | Total: Q${row.total_amount}`
      );
  });

  doc.end();
};
