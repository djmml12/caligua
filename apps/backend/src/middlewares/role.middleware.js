export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.user?.role_name;

    if (!userRole) {
      return res.status(403).json({ message: "Rol no definido" });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: "Acceso denegado" });
    }

    next();
  };
};