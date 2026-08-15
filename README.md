# Secure Local Filesystem REST API

A production-ready, clean, and highly secure REST API for managing files and directories within a configured sandbox directory (`BASE_DIRECTORY`) built using **Node.js** and **Express.js**.

---

## Features

- **Strict Sandbox Directory Control**: All operations (`GET /files`, `GET /search`, `POST /files/copy`, `POST /files/move`, `DELETE /files`) are locked into a configured absolute path.
- **Robust Path Traversal Prevention**: Custom validation that decodes URI components, rejects null bytes, normalizes separators, and verifies absolute destinations securely using an ancestor realpath resolution algorithm (mitigating symbolic link and traversal bypasses).
- **Deterministic File Listing**: `GET /files` returns files sorted with directories first, followed by files, and sorted alphabetically by name.
- **Recursive Substring Search**: `GET /search` scans starting paths recursively to return relative paths matching search queries.
- **Atomic Operations**: Safe copying/moving of files and directories recursively, with conflict checks to prevent overwrites, and a cross-device move fallback.
- **Consistent JSON Error Responses**: Formatted and masked error payloads for client security.
- **Container Ready**: Fully configured and tested Docker environment.

---

## Technology Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Environment**: dotenv
- **Containerization**: Docker

---

## Project Structure

```
file-manager-api/
├── Dockerfile
├── .dockerignore
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── src/
│   ├── app.js
│   ├── config.js
│   ├── routes/
│   │   └── files.js
│   ├── services/
│   │   └── fileService.js
│   └── utils/
│       └── pathUtils.js
└── data/
    ├── archive/
    │   └── old_report.txt
    ├── documents/
    │   └── report.txt
    ├── images/
    ├── readme.txt
    └── sample.txt
```

---

## Environment Variables

The root-level `.env.example` contains:

```env
API_PORT=8080
BASE_DIRECTORY=./data
```

- **`API_PORT`**: Port on which the API listens (default: `8080`).
- **`BASE_DIRECTORY`**: Path to the sandboxed file storage root (default: `./data`). Resolves to an absolute path internally.

---

## Local Installation & Run Instructions

### Prerequisites
- Node.js installed (v18 or newer)
- npm installed (comes with Node.js)

### 1. Install Dependencies
Run the following command to download and install required dependencies:
```bash
npm install
```

### 2. Start Application Locally
To start the production server:
```bash
npm start
```

For development mode (reloads automatically using nodemon):
```bash
npm run dev
```

The API will be running at `http://localhost:8080`.

---

## Docker Build & Run Instructions

### 1. Build the Docker Image
```bash
docker build -t file-manager-api .
```

### 2. Run the Docker Container
Run the container and mount your local `data/` directory to `/app/data` inside the container:
```bash
docker run -p 8080:8080 -e API_PORT=8080 -e BASE_DIRECTORY=/app/data -v $(pwd)/data:/app/data file-manager-api
```

*(Note: On Windows PowerShell, replace `$(pwd)` with `${PWD}` or use absolute path, e.g. `C:\Users\...\data:/app/data`)*

The container will launch and listen on `0.0.0.0:8080`. The API will be available at `http://localhost:8080`.

---

## API Documentation

All endpoints return JSON responses. If an operation fails, a standardized error payload is returned.

### 1. GET /files
Lists files and folders inside the requested directory.

- **URL**: `/files`
- **Method**: `GET`
- **Query Parameters**:
  - `path` (optional): The relative path of the directory to list (e.g. `documents`). If omitted, lists the root base directory.
- **Successful Response (200 OK)**:
  ```json
  [
    {
      "name": "archive",
      "type": "directory",
      "size": 0
    },
    {
      "name": "documents",
      "type": "directory",
      "size": 0
    },
    {
      "name": "readme.txt",
      "type": "file",
      "size": 47
    }
  ]
  ```
- **Error Responses**:
  - **403 Forbidden** (Traversal attempt):
    ```json
    {
      "error": {
        "message": "Access denied: Path is outside the allowed directory."
      }
    }
    ```
  - **404 Not Found** (Path does not exist):
    ```json
    {
      "error": {
        "message": "Not Found: The path 'documents/nonexistent' does not exist."
      }
    }
    ```

---

### 2. GET /search
Recursively searches for matching file names.

- **URL**: `/search`
- **Method**: `GET`
- **Query Parameters**:
  - `query` (required): Substring search term to match against file names.
  - `path` (optional): Relative starting path for recursive search.
- **Successful Response (200 OK)**:
  ```json
  [
    "documents/report.txt",
    "archive/old_report.txt"
  ]
  ```
- **Error Responses**:
  - **400 Bad Request** (Missing/invalid query parameter):
    ```json
    {
      "error": {
        "message": "Bad Request: 'query' parameter is required and must be a non-empty string."
      }
    }
    ```

---

### 3. POST /files/copy
Copies a file or folder recursively.

- **URL**: `/files/copy`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "from": "documents/report.txt",
    "to": "archive/report_copy.txt"
  }
  ```
- **Successful Response (200 OK)**:
  ```json
  {
    "message": "Copied successfully from 'documents/report.txt' to 'archive/report_copy.txt'"
  }
  ```
- **Error Responses**:
  - **404 Not Found** (Source does not exist):
    ```json
    {
      "error": {
        "message": "Not Found: The path 'documents/nonexistent.txt' does not exist."
      }
    }
    ```
  - **409 Conflict** (Destination already exists):
    ```json
    {
      "error": {
        "message": "Conflict: The destination 'archive/old_report.txt' already exists."
      }
    }
    ```

---

### 4. POST /files/move
Moves a file or folder.

- **URL**: `/files/move`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "from": "sample.txt",
    "to": "archive/sample_moved.txt"
  }
  ```
- **Successful Response (200 OK)**:
  ```json
  {
    "message": "Moved successfully from 'sample.txt' to 'archive/sample_moved.txt'"
  }
  ```
- **Error Responses**:
  - **409 Conflict** (Destination already exists):
    ```json
    {
      "error": {
        "message": "Conflict: The destination 'archive/old_report.txt' already exists."
      }
    }
    ```

---

### 5. DELETE /files
Deletes a file or directory recursively.

- **URL**: `/files`
- **Method**: `DELETE`
- **Query Parameters**:
  - `path` (required): The relative path to delete.
- **Successful Response (200 OK)**:
  ```json
  {
    "message": "Deleted successfully: 'archive/sample_moved.txt'"
  }
  ```
- **Error Responses**:
  - **400 Bad Request** (Attempting to delete root base directory):
    ```json
    {
      "error": {
        "message": "Bad Request: Deletion of the base directory is not allowed."
      }
    }
    ```

---

## Security & Path Traversal Mitigations

This application implements several layers of security checks to prevent sandbox escape:

1. **URI Decoding**: The path is parsed with `decodeURIComponent` first, ensuring obfuscation characters like `%2e%2e%2f` are decoded to `../` before verification.
2. **Null Byte Check**: If the string contains a null byte (`\0`), the request is rejected instantly.
3. **Separator Normalization**: Mixed backslash (`\`) and forward slash (`/`) separators are normalized to `/` to avoid platform-specific traversal evasion.
4. **Absolute Path Block**: Absolute paths starting with Windows drive letters (e.g. `C:`) or Unix `/` are resolved and checked. Windows absolute formats are rejected explicitly when running on non-Windows servers to prevent filesystem anomalies.
5. **Ancestral Realpath Resolution**: To prevent symlink escapes, we traverse up each component of the path to find the closest ancestor directory that exists, resolve its real path on disk (which resolves symlinks), and combine it with the remainder.
6. **Lexical Boundary Check**: The final absolute path is evaluated against the configured `BASE_DIRECTORY` using `path.relative`. If it goes outside (`relative` starts with `..` or is absolute), HTTP 403 Forbidden is returned.

---

## Testing & Verification

A script is provided to verify all core functional and security behaviors.

### Local Testing Command
1. Ensure the app is running locally: `npm start`
2. Run the test script in a separate window:
   ```bash
   node test.js
   ```

### Docker Verification
1. Build container: `docker build -t file-manager-api .`
2. Run container:
   ```bash
   docker run -p 8080:8080 -e API_PORT=8080 -e BASE_DIRECTORY=/app/data -v $(pwd)/data:/app/data file-manager-api
   ```
3. Run tests against container:
   ```bash
   node test.js
   ```
