// A thrown ApiError becomes a clean JSON response. Anything else becomes a 500
// with the detail logged but not leaked.

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const badRequest = (msg, extra) => new ApiError(400, 'bad_request', msg, extra)
export const unauthorized = (msg = 'Sign in to continue.') => new ApiError(401, 'unauthorized', msg)
export const forbidden = (msg, extra) => new ApiError(403, 'forbidden', msg, extra)
export const notFound = (msg = 'Not found.') => new ApiError(404, 'not_found', msg)

// Express 4 does not catch rejections from async handlers, which turns a
// transient Supabase blip into a hung request.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } })
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path}`, err)
  } else {
    console.warn(`[${status}] ${req.method} ${req.path} — ${err.message}`)
  }
  res.status(status).json({
    error: {
      code: err.code || 'server_error',
      message: status >= 500 ? 'Something went wrong on our side.' : err.message,
      ...(err.extra || {}),
    },
  })
}
