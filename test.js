const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const app = require('./src/app');
const config = require('./src/config');

const TEST_PORT = 8081;
let server;

// Helper to make HTTP requests
function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = data;
        if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            // Ignore parse errors
          }
        }
        resolve({
          statusCode: res.statusCode,
          body: parsed,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Reset the data directory to a deterministic state
async function resetDataDir() {
  const base = config.baseDirectory;
  
  // Clean directory recursively if it exists
  try {
    await fs.rm(base, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }

  // Create structure
  await fs.mkdir(base, { recursive: true });
  await fs.mkdir(path.join(base, 'archive'), { recursive: true });
  await fs.mkdir(path.join(base, 'documents'), { recursive: true });
  await fs.mkdir(path.join(base, 'images'), { recursive: true });

  await fs.writeFile(path.join(base, 'readme.txt'), 'Welcome to the test root.');
  await fs.writeFile(path.join(base, 'sample.txt'), 'Sample file content.');
  await fs.writeFile(path.join(base, 'archive', 'old_report.txt'), 'Archived report content.');
  await fs.writeFile(path.join(base, 'documents', 'report.txt'), 'Active report content.');
  await fs.writeFile(path.join(base, 'images', '.gitkeep'), '# gitkeep');
}

// Simple test assertion helper
let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('Starting API Test Suite...\n');

  // 1. GET /files root
  {
    await resetDataDir();
    const res = await request('GET', '/files');
    assert(res.statusCode === 200, '1. GET /files root status');
    assert(Array.isArray(res.body), '1. GET /files root body is array');
    assert(res.body.length === 5, '1. GET /files root item count');
  }

  // 2. GET /files with nested path
  {
    const res = await request('GET', '/files?path=documents');
    assert(res.statusCode === 200, '2. GET /files nested status');
    assert(res.body.length === 1 && res.body[0].name === 'report.txt', '2. GET /files nested content');
  }

  // 3. Directory-first sorting
  // 4. Alphabetical sorting
  {
    const res = await request('GET', '/files');
    // Expected order: 
    // Directories (alphabetical): archive, documents, images
    // Files (alphabetical): readme.txt, sample.txt
    const names = res.body.map(i => i.name);
    const expected = ['archive', 'documents', 'images', 'readme.txt', 'sample.txt'];
    assert(
      JSON.stringify(names) === JSON.stringify(expected),
      '3 & 4. GET /files sorting (directories first, then files alphabetically)'
    );
  }

  // 5. GET /search
  {
    const res = await request('GET', '/search?query=report');
    assert(res.statusCode === 200, '5. GET /search status');
    assert(Array.isArray(res.body), '5. GET /search body is array');
  }

  // 6. Recursive search
  {
    const res = await request('GET', '/search?query=report');
    const files = res.body.sort();
    assert(
      files.includes('archive/old_report.txt') && files.includes('documents/report.txt'),
      '6. GET /search recursive search outputs matching paths relative to base'
    );
  }

  // 7. POST /files/copy
  {
    await resetDataDir();
    const res = await request('POST', '/files/copy', {
      from: 'sample.txt',
      to: 'sample_copy.txt',
    });
    assert(res.statusCode === 200, '7. POST /files/copy file status');
    const destContent = await fs.readFile(path.join(config.baseDirectory, 'sample_copy.txt'), 'utf8');
    assert(destContent === 'Sample file content.', '7. POST /files/copy file target check');
  }

  // 8. Copy directory
  {
    await resetDataDir();
    const res = await request('POST', '/files/copy', {
      from: 'documents',
      to: 'documents_copy',
    });
    assert(res.statusCode === 200, '8. POST /files/copy directory status');
    const copyFileExists = await fs.access(path.join(config.baseDirectory, 'documents_copy', 'report.txt'))
      .then(() => true).catch(() => false);
    assert(copyFileExists, '8. POST /files/copy directory recursively copied');
  }

  // 9. POST /files/move
  {
    await resetDataDir();
    const res = await request('POST', '/files/move', {
      from: 'sample.txt',
      to: 'sample_moved.txt',
    });
    assert(res.statusCode === 200, '9. POST /files/move status');
    const destExists = await fs.access(path.join(config.baseDirectory, 'sample_moved.txt'))
      .then(() => true).catch(() => false);
    const sourceExists = await fs.access(path.join(config.baseDirectory, 'sample.txt'))
      .then(() => true).catch(() => false);
    assert(destExists && !sourceExists, '9. POST /files/move completes atomic rename');
  }

  // 10. Move directory
  {
    await resetDataDir();
    const res = await request('POST', '/files/move', {
      from: 'documents',
      to: 'documents_moved',
    });
    assert(res.statusCode === 200, '10. POST /files/move directory status');
    const destExists = await fs.access(path.join(config.baseDirectory, 'documents_moved', 'report.txt'))
      .then(() => true).catch(() => false);
    const sourceExists = await fs.access(path.join(config.baseDirectory, 'documents'))
      .then(() => true).catch(() => false);
    assert(destExists && !sourceExists, '10. POST /files/move directory content shifted');
  }

  // 11. DELETE /files
  {
    await resetDataDir();
    const res = await request('DELETE', '/files?path=sample.txt');
    assert(res.statusCode === 200, '11. DELETE /files status');
    const sourceExists = await fs.access(path.join(config.baseDirectory, 'sample.txt'))
      .then(() => true).catch(() => false);
    assert(!sourceExists, '11. DELETE /files removes single file');
  }

  // 12. Delete directory
  {
    await resetDataDir();
    const res = await request('DELETE', '/files?path=documents');
    assert(res.statusCode === 200, '12. DELETE /files directory status');
    const dirExists = await fs.access(path.join(config.baseDirectory, 'documents'))
      .then(() => true).catch(() => false);
    assert(!dirExists, '12. DELETE /files directory deleted recursively');
  }

  // 13. 403 traversal using ../
  {
    const res = await request('GET', '/files?path=../');
    assert(
      res.statusCode === 403 && res.body.error.message === 'Access denied: Path is outside the allowed directory.',
      '13. GET /files blocks traversal with ../'
    );
  }

  // 14. 403 traversal using ../../
  {
    const res = await request('GET', '/files?path=../../');
    assert(res.statusCode === 403, '14. GET /files blocks traversal with ../../');
  }

  // 15. 403 absolute path
  {
    // On POSIX it tries to access /etc, on Windows it tries to resolve outside current workspace drive root
    // Our custom resolver treats POSIX absolute starting with / or drive letters as traversal attempt
    const res = await request('GET', '/files?path=/etc');
    assert(res.statusCode === 403, '15. GET /files blocks absolute path');
  }

  // 16. 403 traversal on copy `from`
  {
    const res = await request('POST', '/files/copy', {
      from: '../outside.txt',
      to: 'target.txt',
    });
    assert(res.statusCode === 403, '16. POST /files/copy blocks traversal on from');
  }

  // 17. 403 traversal on copy `to`
  {
    const res = await request('POST', '/files/copy', {
      from: 'sample.txt',
      to: '../outside_copy.txt',
    });
    assert(res.statusCode === 403, '17. POST /files/copy blocks traversal on to');
  }

  // 18. 403 traversal on move `from`
  {
    const res = await request('POST', '/files/move', {
      from: '../outside.txt',
      to: 'target.txt',
    });
    assert(res.statusCode === 403, '18. POST /files/move blocks traversal on from');
  }

  // 19. 403 traversal on move `to`
  {
    const res = await request('POST', '/files/move', {
      from: 'sample.txt',
      to: '../outside_move.txt',
    });
    assert(res.statusCode === 403, '19. POST /files/move blocks traversal on to');
  }

  // 20. 403 traversal on delete
  {
    const res = await request('DELETE', '/files?path=../outside.txt');
    assert(res.statusCode === 403, '20. DELETE /files blocks traversal on path');
  }

  // 21. 404 missing GET /files path
  {
    const res = await request('GET', '/files?path=nonexistent');
    assert(
      res.statusCode === 404 && res.body.error.message === "Not Found: The path 'nonexistent' does not exist.",
      '21. GET /files missing path yields 404'
    );
  }

  // 22. 404 missing search path
  {
    const res = await request('GET', '/search?query=test&path=nonexistent');
    assert(res.statusCode === 404, '22. GET /search missing path yields 404');
  }

  // 23. 404 missing copy source
  {
    const res = await request('POST', '/files/copy', {
      from: 'nonexistent.txt',
      to: 'target.txt',
    });
    assert(res.statusCode === 404, '23. POST /files/copy missing source yields 404');
  }

  // 24. 404 missing move source
  {
    const res = await request('POST', '/files/move', {
      from: 'nonexistent.txt',
      to: 'target.txt',
    });
    assert(res.statusCode === 404, '24. POST /files/move missing source yields 404');
  }

  // 25. 404 missing delete path
  {
    const res = await request('DELETE', '/files?path=nonexistent.txt');
    assert(res.statusCode === 404, '25. DELETE /files missing path yields 404');
  }

  // 26. 409 copy destination exists
  {
    await resetDataDir();
    const res = await request('POST', '/files/copy', {
      from: 'readme.txt',
      to: 'sample.txt',
    });
    assert(res.statusCode === 409, '26. POST /files/copy destination exists yields 409 Conflict');
  }

  // 27. 409 move destination exists
  {
    await resetDataDir();
    const res = await request('POST', '/files/move', {
      from: 'readme.txt',
      to: 'sample.txt',
    });
    assert(res.statusCode === 409, '27. POST /files/move destination exists yields 409 Conflict');
  }

  // 28. Verify copy does not remove source
  {
    await resetDataDir();
    await request('POST', '/files/copy', {
      from: 'readme.txt',
      to: 'readme_copy.txt',
    });
    const sourceExists = await fs.access(path.join(config.baseDirectory, 'readme.txt'))
      .then(() => true).catch(() => false);
    assert(sourceExists, '28. Copy operation does not remove source file');
  }

  // 29. Verify move removes source
  {
    await resetDataDir();
    await request('POST', '/files/move', {
      from: 'readme.txt',
      to: 'readme_moved.txt',
    });
    const sourceExists = await fs.access(path.join(config.baseDirectory, 'readme.txt'))
      .then(() => true).catch(() => false);
    assert(!sourceExists, '29. Move operation removes source file');
  }

  // 30. Verify delete removes target
  {
    await resetDataDir();
    await request('DELETE', '/files?path=readme.txt');
    const targetExists = await fs.access(path.join(config.baseDirectory, 'readme.txt'))
      .then(() => true).catch(() => false);
    assert(!targetExists, '30. Delete operation removes target file');
  }

  // Extra Security: Verify Cannot delete Base Directory itself
  {
    await resetDataDir();
    const res = await request('DELETE', '/files?path=');
    assert(
      res.statusCode === 400 && res.body.error.message.includes('Deletion of the base directory is not allowed'),
      'Extra Security: Prevent deleting root base directory'
    );
  }

  // Extra Security: Verify Windows Drive Letter Traversal block on Linux
  if (process.platform !== 'win32') {
    const res = await request('GET', '/files?path=C:\\Windows');
    assert(res.statusCode === 403, 'Extra Security: Blocks Windows drive paths on Linux');
  }

  console.log('\n======================================');
  console.log(`Test Execution Completed.`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('======================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Start the Express server on TEST_PORT and run tests
server = app.listen(TEST_PORT, '127.0.0.1', async () => {
  try {
    await runTests();
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
});
