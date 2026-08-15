const path = require('path');
const fs = require('fs').promises;
const config = require('../config');

/**
 * Traverses up the path to find the nearest existing ancestor,
 * gets its realpath on the filesystem, and appends the remaining path components.
 * This resolves symlinks securely even for files that do not exist yet.
 * 
 * @param {string} absPath - The absolute path to resolve.
 * @returns {Promise<string>} The resolved real absolute path.
 */
async function resolveRealPathSecure(absPath) {
  let current = absPath;
  const tail = [];

  while (true) {
    try {
      // Check if current path exists
      await fs.access(current);
      const real = await fs.realpath(current);
      return path.join(real, ...tail.reverse());
    } catch (err) {
      const parent = path.dirname(current);
      // If we've reached the root and still can't access it, return the path as-is
      if (parent === current) {
        return path.join(current, ...tail.reverse());
      }
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Validates and resolves a user-provided path against the configured BASE_DIRECTORY.
 * Throws a 403 error if the path resolves outside BASE_DIRECTORY.
 * Throws a 400 error if path contains malformed URL encoding.
 * 
 * @param {string} userPath - The path provided by the user.
 * @returns {Promise<string>} The resolved absolute path.
 */
async function resolveSafePath(userPath) {
  const baseDir = config.baseDirectory;

  // If path is omitted, null, or empty, default to BASE_DIRECTORY
  if (userPath === undefined || userPath === null || userPath === '') {
    return baseDir;
  }

  // Ensure it's a string
  if (typeof userPath !== 'string') {
    const error = new Error("Bad Request: Path must be a string.");
    error.statusCode = 400;
    throw error;
  }

  // 1. Decode URI component to prevent encoded traversal tricks
  let decoded;
  try {
    decoded = decodeURIComponent(userPath);
  } catch (e) {
    const error = new Error("Bad Request: Malformed path encoding.");
    error.statusCode = 400;
    throw error;
  }

  // 2. Reject null byte character (classic traversal/injection trick)
  if (decoded.includes('\0')) {
    const error = new Error("Access denied: Path is outside the allowed directory.");
    error.statusCode = 403;
    throw error;
  }

  // 3. Normalize backslashes to forward slashes to handle mixed separators consistently
  const normalized = decoded.replace(/\\/g, '/');

  // 4. Reject Windows absolute paths explicitly when running on Unix
  // (On Windows, path.resolve will handle them and they will fail the relative boundary check)
  const isWindowsAbsolute = /^[a-zA-Z]:/.test(normalized) || normalized.startsWith('//');
  if (isWindowsAbsolute && process.platform !== 'win32') {
    const error = new Error("Access denied: Path is outside the allowed directory.");
    error.statusCode = 403;
    throw error;
  }

  // 5. Lexically resolve the path relative to baseDir
  const resolvedPath = path.resolve(baseDir, normalized);

  // 6. Securely resolve real path to account for symlinks
  const finalPath = await resolveRealPathSecure(resolvedPath);

  // 7. Check if finalPath is within baseDir using path.relative
  const relative = path.relative(baseDir, finalPath);

  // Check if it starts with '..' or is absolute (different drive on Windows)
  const isOutside = relative === '..' ||
                    relative.startsWith('..' + path.sep) ||
                    relative.startsWith('../') ||
                    relative.startsWith('..\\') ||
                    path.isAbsolute(relative);

  if (isOutside) {
    const error = new Error("Access denied: Path is outside the allowed directory.");
    error.statusCode = 403;
    throw error;
  }

  return finalPath;
}

/**
 * Converts an absolute path to a relative path from BASE_DIRECTORY using forward slashes.
 * @param {string} absolutePath - The absolute path.
 * @returns {string} Relative path using forward slashes.
 */
function toRelativeForwardSlash(absolutePath) {
  const baseDir = config.baseDirectory;
  const relative = path.relative(baseDir, absolutePath);
  if (!relative) return '';
  return relative.split(path.sep).join('/');
}

module.exports = {
  resolveSafePath,
  toRelativeForwardSlash,
};
