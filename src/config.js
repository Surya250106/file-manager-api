const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env if present
dotenv.config();

const rawBaseDir = process.env.BASE_DIRECTORY || './data';
// Resolve base directory to an absolute path internally
const baseDirectory = path.resolve(rawBaseDir);

module.exports = {
  port: parseInt(process.env.API_PORT || '8080', 10),
  baseDirectory,
};
