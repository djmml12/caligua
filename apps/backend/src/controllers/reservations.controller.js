import {
  createReservationService,
  getReservationsService,
  getReservationByIdService,
  updateReservationService,
  deleteReservationService,
} from "../services/reservations.service.js";

export const createReservation = async (req, res) => {
  try {
    const { customer_name, phone, date, time, items, notes } = req.body ?? {};
    if (!customer_name || !date) {
      return res.status(400).json({ success: false, message: "customer_name y date son requeridos" });
    }
    const reservation = await createReservationService(req.user?.id, { customer_name, phone, date, time, items, notes });
    res.status(201).json({ success: true, data: reservation });
  } catch (error) {
    console.error("CREATE RESERVATION ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error creando reserva" });
  }
};

export const getReservations = async (req, res) => {
  try {
    const { date, status } = req.query;
    const reservations = await getReservationsService({ date, status });
    res.json({ success: true, data: reservations });
  } catch (error) {
    console.error("GET RESERVATIONS ERROR:", error);
    res.status(500).json({ success: false, message: "Error obteniendo reservas" });
  }
};

export const getReservationById = async (req, res) => {
  try {
    const reservation = await getReservationByIdService(Number(req.params.id));
    if (!reservation) return res.status(404).json({ success: false, message: "Reserva no encontrada" });
    res.json({ success: true, data: reservation });
  } catch (error) {
    console.error("GET RESERVATION ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo reserva" });
  }
};

export const updateReservation = async (req, res) => {
  try {
    const reservation = await updateReservationService(Number(req.params.id), req.body ?? {});
    if (!reservation) return res.status(404).json({ success: false, message: "Reserva no encontrada" });
    res.json({ success: true, data: reservation });
  } catch (error) {
    console.error("UPDATE RESERVATION ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error actualizando reserva" });
  }
};

export const deleteReservation = async (req, res) => {
  try {
    await deleteReservationService(Number(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error("DELETE RESERVATION ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Error eliminando reserva" });
  }
};
