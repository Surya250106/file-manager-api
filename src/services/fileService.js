const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { resolveSafePath, toRelativeForwardSlash } = require('../utils/pathUtils');

/**
 * Custom recursive directory copy helper.
 * Ensures parent directories of the destination are created.
 */
async function copyRecursive(src, dest) {
  const stats = await fs.stat(src);
  if (stats.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const items = await fs.readdir(src);
    for (const item of items) {
      await copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

/**
 * Lists the contents of a directory.
 * Returns a sorted array of files and directories inside the userPath.
 */
async function listFiles(userPath) {
  const resolvedPath = await resolveSafePath(userPath);

  // Check if path exists
  let stats;
  try {
    stats = await fs.stat(resolvedPath);
  } catch (err) {
    const relativeDisplay = toRelativeForwardSlash(resolvedPath) || userPath || '';
    const error = new Error(`Not Found: The path '${relativeDisplay}' does not exist.`);
    error.statusCode = 404;
    throw error;
  }

  // Ensure it's a directory
  if (!stats.isDirectory()) {
    const relativeDisplay = toRelativeForwardSlash(resolvedPath) || userPath || '';
    const error = new Error(`Bad Request: The path '${relativeDisplay}' exists but is not a directory.`);
    error.statusCode = 400;
    throw error;
  }

  // Read directory contents
  const items = await fs.readdir(resolvedPath);
  const results = [];

  for (const item of items) {
    const itemAbsPath = path.join(resolvedPath, item);
    
    // Check security boundary of this specific item
    try {
      const itemRelPath = toRelativeForwardSlash(itemAbsPath);
      // This will throw if it is outside (e.g. symlink escape)
      await resolveSafePath(itemRelPath);

      const itemStats = await fs.stat(itemAbsPath);
      if (itemStats.isDirectory()) {
        results.push({
          name: item,
          type: 'directory',
          size: 0,
        });
      } else if (itemStats.isFile()) {
        results.push({
          name: item,
          type: 'file',
          size: itemStats.size,
        });
      }
    } catch (e) {
      // Skip item if it violates security or stat fails (e.g. broken symlink)
    }
  }

  // Sort: 1. Directories first, 2. Files second, 3. Alphabetically by name (case-insensitive)
  results.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });

  return results;
}

/**
 * Recursively searches for files matching the query substring.
 */
async function searchFiles(userPath, query) {
  const resolvedPath = await resolveSafePath(userPath);

  // Check if starting path exists
  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      const relativeDisplay = toRelativeForwardSlash(resolvedPath) || userPath || '';
      const error = new Error(`Bad Request: The starting path '${relativeDisplay}' exists but is not a directory.`);
      error.statusCode = 400;
      throw error;
    }
  } catch (err) {
    if (err.statusCode) throw err;
    const relativeDisplay = toRelativeForwardSlash(resolvedPath) || userPath || '';
    const error = new Error(`Not Found: The path '${relativeDisplay}' does not exist.`);
    error.statusCode = 404;
    throw error;
  }

  const results = [];
  const queryLower = query.toLowerCase();

  async function recurse(currentDir) {
    const items = await fs.readdir(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      
      // Perform security check
      try {
        const itemRelPath = toRelativeForwardSlash(fullPath);
        await resolveSafePath(itemRelPath);

        const itemStats = await fs.stat(fullPath);
        if (itemStats.isDirectory()) {
          await recurse(fullPath);
        } else if (itemStats.isFile()) {
          if (item.toLowerCase().includes(queryLower)) {
            results.push(toRelativeForwardSlash(fullPath));
          }
        }
      } catch (e) {
        // Skip inaccessible or unsafe files
      }
    }
  }

  await recurse(resolvedPath);
  return results;
}

/**
 * Copies a file or directory recursively.
 */
async function copyItem(fromUserPath, toUserPath) {
  // Validate both paths
  const fromAbs = await resolveSafePath(fromUserPath);
  const toAbs = await resolveSafePath(toUserPath);

  // Check source existence
  try {
    await fs.access(fromAbs);
  } catch (err) {
    const error = new Error(`Not Found: The path '${fromUserPath}' does not exist.`);
    error.statusCode = 404;
    throw error;
  }

  // Check destination existence (never overwrite)
  let toExists = false;
  try {
    await fs.access(toAbs);
    toExists = true;
  } catch (e) {
    toExists = false;
  }

  if (toExists) {
    const error = new Error(`Conflict: The destination '${toUserPath}' already exists.`);
    error.statusCode = 409;
    throw error;
  }

  // Perform copy
  await copyRecursive(fromAbs, toAbs);
}

/**
 * Moves a file or directory. Handles cross-device moves securely.
 */
async function moveItem(fromUserPath, toUserPath) {
  // Validate both paths
  const fromAbs = await resolveSafePath(fromUserPath);
  const toAbs = await resolveSafePath(toUserPath);

  // Check source existence
  try {
    await fs.access(fromAbs);
  } catch (err) {
    const error = new Error(`Not Found: The path '${fromUserPath}' does not exist.`);
    error.statusCode = 404;
    throw error;
  }

  // Check destination existence (never overwrite)
  let toExists = false;
  try {
    await fs.access(toAbs);
    toExists = true;
  } catch (e) {
    toExists = false;
  }

  if (toExists) {
    const error = new Error(`Conflict: The destination '${toUserPath}' already exists.`);
    error.statusCode = 409;
    throw error;
  }

  // Ensure destination parent folder exists
  await fs.mkdir(path.dirname(toAbs), { recursive: true });

  // Perform move
  try {
    await fs.rename(fromAbs, toAbs);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Fallback for cross-device mount copies
      await copyRecursive(fromAbs, toAbs);
      await fs.rm(fromAbs, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

/**
 * Deletes a file or directory recursively.
 */
async function deleteItem(userPath) {
  if (userPath === undefined || userPath === null) {
    const error = new Error("Bad Request: Path query parameter is required.");
    error.statusCode = 400;
    throw error;
  }

  const targetAbs = await resolveSafePath(userPath);

  // Prevent deleting the base directory itself
  if (targetAbs === config.baseDirectory) {
    const error = new Error("Bad Request: Deletion of the base directory is not allowed.");
    error.statusCode = 400;
    throw error;
  }

  // Check existence
  try {
    await fs.access(targetAbs);
  } catch (err) {
    const error = new Error(`Not Found: The path '${userPath}' does not exist.`);
    error.statusCode = 404;
    throw error;
  }

  // Perform recursive delete
  await fs.rm(targetAbs, { recursive: true, force: true });
}

module.exports = {
  listFiles,
  searchFiles,
  copyItem,
  moveItem,
  deleteItem,
};
