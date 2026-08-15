const express = require('express');
const config = require('./config');
const filesRouter = require('./routes/files');

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Handle malformed JSON body errors cleanly
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        message: "Bad Request: Malformed JSON."
      }
    });
  }
  next(err);
});

// Health check endpoint (optional but helpful)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Mount the files router
// Note: Paths in routes are /files, /search, /files/copy, /files/move
// We will mount directly to root / so the paths match exactly what is required.
app.use('/', filesRouter);

// Handle undefined endpoints
app.use((req, res, next) => {
  const error = new Error(`Not Found: The requested endpoint '${req.originalUrl}' does not exist.`);
  error.statusCode = 404;
  next(error);
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  let message = err.message;

  // Mask internal server error details in production responses
  if (status === 500) {
    console.error('Unhandled internal server error:', err);
    message = 'Internal Server Error';
  }

  res.status(status).json({
    error: {
      message
    }
  });
});

// Listen on all network interfaces (0.0.0.0)
app.listen(config.port, '0.0.0.0', () => {
  console.log(`File Manager API server running on http://0.0.0.0:${config.port}`);
  console.log(`Base sandbox directory resolved to: ${config.baseDirectory}`);
});

module.exports = app;
