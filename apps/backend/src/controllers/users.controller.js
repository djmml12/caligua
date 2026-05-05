import {
  getUsersService,
  createUserService,
  updateUserService,
} from "../services/user.service.js";

export const getUsers = async (req, res) => {
  try {
    const users = await getUsersService();
    res.json(users);
  } catch (error) {
    console.error("❌ Error obteniendo usuarios:", error.message);
    res.status(500).json({ message: "Error obteniendo usuarios" });
  }
};

export const createUser = async (req, res) => {
  try {
    const user = await createUserService(req.body);
    res.status(201).json(user);
  } catch (error) {
    console.error("❌ Error creando usuario:", error.message);
    res.status(400).json({ message: error.message || "Error creando usuario" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const updated = await updateUserService(id, req.body);
    res.json(updated);
  } catch (error) {
    console.error("❌ Error actualizando usuario:", error.message);
    res.status(400).json({ message: error.message || "Error actualizando usuario" });
  }
};
