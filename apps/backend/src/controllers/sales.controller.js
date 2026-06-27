import {
  createSaleService,
  createAndPaySaleService,
  getOpenSalesService,
  getSaleByIdService,
  updateSaleService,
  paySaleService,
  paySaleWithTipService,
  cancelSaleService,
  getPaidSalesTodayService,
} from "../services/sales.service.js";

/**
 * POST /sales
 * Two modes:
 *  - Body has `items` array → one-shot create+pay (tablet flow)
 *  - Body has no items → create empty open sale (desktop flow)
 */
export const createSale = async (req, res) => {
  try {
    const { items, order_id, reference, tip_amount, tip_percentage, client_request_id } = req.body ?? {};

    if (Array.isArray(items) && items.length > 0) {
      const sale = await createAndPaySaleService(req.user?.id, {
        items, order_id, reference, tip_amount, tip_percentage, client_request_id,
      });
      return res.status(201).json(sale);
    }

    const sale = await createSaleService(req.user?.id, reference || null);
    res.status(201).json({ success: true, data: sale });
  } catch (error) {
    console.error("CREATE SALE ERROR:", error);
    res.status(400).json({ success: false, message: error.message || "Error creando venta" });
  }
};

export const getOpenSales = async (req, res) => {
  try {
    const sales = await getOpenSalesService();
    res.json({ success: true, data: sales });
  } catch (error) {
    console.error("GET OPEN SALES ERROR:", error);
    res.status(500).json({ success: false, message: "Error obteniendo órdenes abiertas" });
  }
};

export const getSaleById = async (req, res) => {
  try {
    const sale = await getSaleByIdService(Number(req.params.id));
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error("GET SALE ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo orden" });
  }
};

export const updateSale = async (req, res) => {
  try {
    const { items, notes } = req.body ?? {};
    const sale = await updateSaleService(Number(req.params.id), items, notes);
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error("UPDATE SALE ERROR:", error);
    res.status(400).json({ success: false, message: error.message || "Error guardando orden" });
  }
};

export const paySale = async (req, res) => {
  try {
    const sale = await paySaleService(Number(req.params.id), req.user?.id);
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error("PAY SALE ERROR:", error);
    res.status(400).json({ success: false, message: error.message || "Error cobrando orden" });
  }
};

export const paySaleWithTip = async (req, res) => {
  try {
    const sale = await paySaleWithTipService(Number(req.params.id), req.user?.id);
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error("PAY SALE TIP ERROR:", error);
    res.status(400).json({ success: false, message: error.message || "Error cobrando con propina" });
  }
};

export const getPaidSales = async (req, res) => {
  try {
    const date = req.query.date || null;
    const sales = await getPaidSalesTodayService(date);
    res.json({ success: true, data: sales });
  } catch (error) {
    console.error("GET PAID SALES ERROR:", error);
    res.status(500).json({ success: false, message: "Error obteniendo ventas cobradas" });
  }
};

export const cancelSale = async (req, res) => {
  try {
    const sale = await cancelSaleService(Number(req.params.id), req.user?.id);
    res.json({ success: true, data: sale });
  } catch (error) {
    console.error("CANCEL SALE ERROR:", error);
    res.status(400).json({ success: false, message: error.message || "Error cancelando orden" });
  }
};
