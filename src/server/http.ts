/**
 * HTTP transport router
 * Routes to appropriate HTTP transport based on configuration
 */

import { logger } from '../utils/index.js';
import { startSseServer, SseServerOptions } from './sse.js';
import { startStreamableHttpServer, StreamableHttpServerOptions } from './streamable-http.js';

/**
 * Configuration options for HTTP server
 * Alias for both SSE and Streamable HTTP options
 */
export interface HttpServerOptions extends SseServerOptions, StreamableHttpServerOptions {
  port?: number;
  host?: string;
}

/**
 * Start HTTP transport with appropriate implementation
 * based on TINYTASK_ENABLE_SSE environment variable
 * 
 * @param taskService - Task management service
 * @param commentService - Comment management service
 * @param linkService - Link management service
 * @param options - Server configuration options
 */
export async function startHttpServer(
  taskService: import('../services/task-service.js').TaskService,
  commentService: import('../services/comment-service.js').CommentService,
  linkService: import('../services/link-service.js').LinkService,
  options?: HttpServerOptions
): Promise<void> {
  const enableSse = process.env.TINYTASK_ENABLE_SSE === 'true';

  if (enableSse) {
    logger.info('🔄 Using SSE transport (legacy mode)');
    return startSseServer(taskService, commentService, linkService, options);
  } else {
    logger.info('✨ Using Streamable HTTP transport');
    return startStreamableHttpServer(taskService, commentService, linkService, options);
  }
}
