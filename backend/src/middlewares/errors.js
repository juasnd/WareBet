function notFound(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

function resolveStatus(err) {
  if (err.status) {
    return err.status;
  }
  if (err.code === '23505' || err.code === '23503') {
    return 409;
  }
  return 500;
}

function errors(err, req, res, next) {
  console.error('Error API:', err.code || err.name || 'Error', err.message);
  if (res.headersSent) {
    return next(err);
  }

  const status = resolveStatus(err);
  const response = { error: status === 500 ? 'Error interno del servidor' : err.message };
  if (process.env.NODE_ENV === 'development' && status === 500) {
    response.detail = err.message;
  }
  res.status(status).json(response);
}

module.exports = { notFound, errors };
