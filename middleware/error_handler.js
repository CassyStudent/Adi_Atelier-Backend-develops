// global error handler — sits at the bottom of the middleware stack in index.js
// any route that calls next(err) or throws an unhandled error lands here
function errorHandler(err, req, res, next) {
  console.error(err);

  // if something upstream already set a status code, use it — otherwise 500
  const status = err.status || 500;

  res.status(status).json({
    error: 'Something went wrong. Please try again.',
  });
}

module.exports = errorHandler;