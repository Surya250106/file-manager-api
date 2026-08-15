const express = require('express');
const router = express.Router();
const fileService = require('../services/fileService');

/**
 * GET /files
 * Lists files and directories in the requested path (default: BASE_DIRECTORY)
 */
router.get('/files', async (req, res, next) => {
  try {
    const { path } = req.query;

    if (path !== undefined && typeof path !== 'string') {
      const error = new Error("Bad Request: 'path' query parameter must be a string.");
      error.statusCode = 400;
      throw error;
    }

    const files = await fileService.listFiles(path);
    res.status(200).json(files);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /search
 * Recursively searches for files matching a query term.
 */
router.get('/search', async (req, res, next) => {
  try {
    const { query, path } = req.query;

    // Validate required 'query' parameter
    if (query === undefined || typeof query !== 'string' || query.trim() === '') {
      const error = new Error("Bad Request: 'query' parameter is required and must be a non-empty string.");
      error.statusCode = 400;
      throw error;
    }

    if (path !== undefined && typeof path !== 'string') {
      const error = new Error("Bad Request: 'path' query parameter must be a string.");
      error.statusCode = 400;
      throw error;
    }

    const matchedFiles = await fileService.searchFiles(path, query);
    res.status(200).json(matchedFiles);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /files/copy
 * Copies a file or directory recursively.
 */
router.post('/files/copy', async (req, res, next) => {
  try {
    const { from, to } = req.body;

    // Validate request body structure
    if (from === undefined || to === undefined || typeof from !== 'string' || typeof to !== 'string') {
      const error = new Error("Bad Request: Both 'from' and 'to' fields are required strings.");
      error.statusCode = 400;
      throw error;
    }

    await fileService.copyItem(from, to);

    res.status(200).json({
      message: `Copied successfully from '${from}' to '${to}'`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /files/move
 * Moves a file or directory.
 */
router.post('/files/move', async (req, res, next) => {
  try {
    const { from, to } = req.body;

    // Validate request body structure
    if (from === undefined || to === undefined || typeof from !== 'string' || typeof to !== 'string') {
      const error = new Error("Bad Request: Both 'from' and 'to' fields are required strings.");
      error.statusCode = 400;
      throw error;
    }

    await fileService.moveItem(from, to);

    res.status(200).json({
      message: `Moved successfully from '${from}' to '${to}'`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /files
 * Deletes a file or directory recursively.
 */
router.delete('/files', async (req, res, next) => {
  try {
    const { path } = req.query;

    // Validate target path is provided
    if (path === undefined || typeof path !== 'string') {
      const error = new Error("Bad Request: The 'path' query parameter is required.");
      error.statusCode = 400;
      throw error;
    }

    await fileService.deleteItem(path);

    res.status(200).json({
      message: `Deleted successfully: '${path}'`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
