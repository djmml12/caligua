import {
  getOpenSalesWithCountService,
  createOpenOrderService,
  updateOpenOrderService,
  getSaleByIdService,
} from "../services/sales.service.js";

/** GET /orders?status=pending  →  list of open orders */
export const getOrders = async (req, res) => {
  try {
    const orders = await getOpenSalesWithCountService();
    res.json(orders);
  } catch (error) {
    console.error("GET ORDERS ERROR:", error);
    res.status(500).json({ message: error.message || "Error obteniendo órdenes" });
  }
};

/** POST /orders  →  create open order with items */
export const createOrder = async (req, res) => {
  try {
    const { items, total, reference, notes } = req.body ?? {};
    const order = await createOpenOrderService(req.user?.id, {
      items: items ?? [],
      reference: reference ?? null,
      notes: notes ?? null
    });
    res.status(201).json(order);
  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);
    res.status(400).json({ message: error.message || "Error creando orden" });
  }
};

/** PUT /orders/:id  →  update items on existing open order */
export const updateOrder = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { items, total, reference, notes } = req.body ?? {};
    const order = await updateOpenOrderService(id, { items: items ?? [], reference, notes });
    res.json(order);
  } catch (error) {
    console.error("UPDATE ORDER ERROR:", error);
    res.status(400).json({ message: error.message || "Error actualizando orden" });
  }
};

/** GET /orders/:id  →  get order with items */
export const getOrderById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const sale = await getSaleByIdService(id);

    // Normalise item field names: tablet expects product_id + name (or product_name)
    const items = (sale.items ?? []).map((item) => ({
      product_id:   item.id ?? item.product_id,
      name:         item.name,
      product_name: item.name,
      price:        item.price,
      quantity:     item.quantity,
      notes:        item.notes,
    }));

    res.json({ ...sale, items });
  } catch (error) {
    console.error("GET ORDER ERROR:", error);
    res.status(404).json({ message: error.message || "Orden no encontrada" });
  }
};
