import * as net from 'net';
import { promises as fs } from 'node:fs';
import type { SocketRequest, SocketResponse } from './types.js';

/**
 * Check if a Unix socket is stale (exists but not accepting connections)
 */
export async function isSocketStale(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // If socket file doesn't exist, it's not stale (it's non-existent)
    fs.access(socketPath).catch(() => {
      resolve(false);
      return;
    }).then(() => {
      const client = net.createConnection({ path: socketPath });
      let resolved = false;

      client.on('error', (err: NodeJS.ErrnoException) => {
        if (!resolved) {
          resolved = true;
          client.destroy();
          // ECONNREFUSED or ENOENT means stale
          resolve(err.code === 'ECONNREFUSED' || err.code === 'ENOENT');
        }
      });

      client.on('connect', () => {
        if (!resolved) {
          resolved = true;
          client.end();
          resolve(false); // Successfully connected = not stale
        }
      });

      // Timeout after 1 second
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          client.destroy();
          resolve(true); // Timeout = consider stale
        }
      }, 1000);
    });
  });
}

/**
 * Clean up a stale socket file
 */
export async function cleanupStaleSocket(socketPath: string): Promise<void> {
  const stale = await isSocketStale(socketPath);

  if (stale) {
    try {
      await fs.unlink(socketPath);
    } catch (err) {
      // Ignore if file doesn't exist
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

/**
 * Send a request to the holder process via Unix socket
 */
export async function sendSocketRequest(
  socketPath: string,
  request: SocketRequest,
  timeoutMs: number = 5000
): Promise<SocketResponse> {
  return new Promise((resolve, reject) => {
    // Check if socket exists
    fs.access(socketPath).catch(() => {
      reject(new Error(`Socket not found: ${socketPath}`));
      return;
    }).then(() => {
      const client = net.createConnection({ path: socketPath });
      let responseData = '';
      let resolved = false;

      client.on('connect', () => {
        // Send request
        client.write(JSON.stringify(request));
      });

      client.on('data', (data) => {
        responseData += data.toString();

        // Check if we have complete JSON (ends with newline)
        if (responseData.endsWith('\n')) {
          if (!resolved) {
            resolved = true;
            try {
              const response = JSON.parse(responseData.trim()) as SocketResponse;
              client.end();
              resolve(response);
            } catch (err) {
              client.end();
              reject(new Error(`Invalid JSON response: ${responseData}`));
            }
          }
        }
      });

      client.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Socket error: ${err.message}`));
        }
      });

      client.on('end', () => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection closed before receiving response'));
        }
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          client.destroy();
          reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    });
  });
}
