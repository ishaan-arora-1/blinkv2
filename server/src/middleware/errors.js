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

  // What gets masked is authorship, not status code.
  //
  // An ApiError's message was written to be read by whoever hit it — that is
  // the entire reason razorpayMessage() digs the gateway's own description out
  // of the SDK's error. Masking on `status >= 500` threw all of that away: a
  // customer whose checkout failed, and the person they then emailed, both got
  // "Something went wrong on our side" instead of "your card was declined" or
  // "the Starter plan is not connected to a Razorpay plan yet" — the latter
  // being a deployment mistake DEPLOY.md tells you to go looking for by its
  // message.
  //
  // Anything that is not an ApiError arrived here by accident and may carry a
  // connection string or a stack frame, so it still says nothing.
  const authored = err instanceof ApiError
  res.status(status).json({
    error: {
      code: err.code || 'server_error',
      message: authored ? err.message : 'Something went wrong on our side.',
      ...(err.extra || {}),
    },
  })
}
