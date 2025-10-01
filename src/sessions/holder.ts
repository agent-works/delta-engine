#!/usr/bin/env node
/**
 * Session Holder Process
 *
 * This is the detached process that manages a PTY and communicates
 * with CLI processes via Unix Domain Socket.
 *
 * Usage:
 *   node holder.js <sessionId> <sessionDir> <command-json>
 */

import * as pty from 'node-pty';
import * as net from 'net';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const MAX_BUFFER_SIZE = 100 * 1024; // 100KB

interface SessionMetadata {
  session_id: string;
  command: string[];
  pid: number;
  holder_pid: number;
  created_at: string;
  last_accessed_at: string;
  status: 'running' | 'dead';
  exit_code?: number;
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: node holder.js <sessionId> <sessionDir> <command-json>');
    process.exit(1);
  }

  const sessionId = args[0]!;
  const sessionDir = args[1]!;
  const command = JSON.parse(args[2]!) as string[];

  // Use /tmp for socket to avoid Unix socket path length limit (104 bytes on macOS)
  const socketPath = `/tmp/delta-sock-${sessionId}.sock`;
  const metadataPath = path.join(sessionDir, 'metadata.json');

  // Create PTY process
  const [cmd, ...cmdArgs] = command;

  if (!cmd) {
    console.error('[Holder] Error: Command cannot be empty');
    process.exit(1);
  }

  let ptyProcess: pty.IPty;

  try {
    ptyProcess = pty.spawn(cmd, cmdArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: process.env as { [key: string]: string },
    });
  } catch (err) {
    console.error('[Holder] Error spawning PTY:', (err as Error).message);
    process.exit(1);
  }

  // Create metadata
  const metadata: SessionMetadata = {
    session_id: sessionId,
    command,
    pid: ptyProcess.pid,
    holder_pid: process.pid,
    created_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    status: 'running',
  };

  // Save initial metadata
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

  // Output buffer
  let outputBuffer = '';

  // Set up PTY data handling
  ptyProcess.onData((data: string) => {
    outputBuffer += data;

    // Limit buffer size
    if (outputBuffer.length > MAX_BUFFER_SIZE) {
      outputBuffer = outputBuffer.slice(-MAX_BUFFER_SIZE);
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    metadata.status = 'dead';
    metadata.exit_code = exitCode;

    // Save final metadata
    fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
      .then(() => {
        // Close socket server
        server.close();
        process.exit(0);
      })
      .catch((err) => {
        console.error('[Holder] Error saving final metadata:', err.message);
        server.close();
        process.exit(1);
      });
  });

  // Create Unix Socket server
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      try {
        const request = JSON.parse(data.toString());

        // Update last accessed time
        metadata.last_accessed_at = new Date().toISOString();

        if (request.type === 'write') {
          // Write to PTY
          ptyProcess.write(request.data);
          socket.write(JSON.stringify({ status: 'ok', bytes: request.data.length }) + '\n');
        } else if (request.type === 'read') {
          // Read and clear buffer (destructive read)
          const output = outputBuffer;
          outputBuffer = '';
          socket.write(JSON.stringify({ status: 'ok', output }) + '\n');
        } else if (request.type === 'peek') {
          // Read without clearing buffer (non-destructive)
          socket.write(JSON.stringify({ status: 'ok', output: outputBuffer }) + '\n');
        } else if (request.type === 'shutdown') {
          // Shutdown request
          socket.write(JSON.stringify({ status: 'ok' }) + '\n');
          socket.end();

          // Kill PTY and exit
          setTimeout(() => {
            ptyProcess.kill();
            server.close();
            process.exit(0);
          }, 100);
        } else {
          socket.write(JSON.stringify({ status: 'error', message: 'Unknown command type' }) + '\n');
        }

        // Save updated metadata (async, don't wait)
        fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8').catch((err) => {
          console.error('[Holder] Error updating metadata:', err.message);
        });
      } catch (err) {
        socket.write(JSON.stringify({ status: 'error', message: (err as Error).message }) + '\n');
      }
    });

    socket.on('error', () => {
      // Ignore socket errors (client disconnected, etc.)
    });
  });

  // Start listening on Unix socket
  server.listen(socketPath, () => {
    // Holder is ready
  });

  server.on('error', (err) => {
    console.error('[Holder] Server error:', err.message);
    process.exit(1);
  });

  // Handle process termination signals
  process.on('SIGTERM', () => {
    ptyProcess.kill();
    server.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    ptyProcess.kill();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Holder] Fatal error:', err.message);
  process.exit(1);
});
