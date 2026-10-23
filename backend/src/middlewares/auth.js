const jwt = require('jsonwebtoken');
const { permissions } = require('../config/permissions');
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Autenticación requerida' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Token inválido o expirado' }); }
}
function authorize(permission) {
  return (req, res, next) => permissions[permission]?.includes(req.user?.perfil) ? next() : res.status(403).json({ error: 'No tienes permiso para esta operación' });
}
module.exports = { authenticate, authorize };
