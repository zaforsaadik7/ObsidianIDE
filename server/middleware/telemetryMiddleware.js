export const telemetryMiddleware = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    console.log(`[TELEMETRY] ${method} ${originalUrl} - ${statusCode} - ${durationMs}ms`);
  });

  next();
};

export default telemetryMiddleware;
