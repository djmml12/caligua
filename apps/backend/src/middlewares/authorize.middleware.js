export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: "No autenticado" });
      }

      const userRole = req.user.role || req.user.role_name;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ success: false, message: "No tiene permisos para esta acción" });
      }

      next();
    } catch (error) {
      console.error("Authorization error:", error);
      return res.status(500).json({ success: false, message: "Error en autorización" });
    }
  };
};