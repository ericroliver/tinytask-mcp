/**
 * Stdio transport for MCP server
 * Enables local development and testing via stdin/stdout
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../utils/index.js';

/**
 * Start the MCP server with stdio transport
 */
export async function startStdioServer(server: Server): Promise<void> {
  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  logger.info('TinyTask MCP server running on stdio');
  logger.info(`Database: ${process.env.TINYTASK_DB_PATH || './data/tinytask.db'}`);
  logger.info('Mode: stdio');
  logger.info('Press Ctrl+C to stop');

  // Handle shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
