/** Compile-checked server integration. Creating a handler does not call a model.
 * The host supplies real authentication and an approved model; no secrets are read here.
 */
export { createChatHandler } from '../dist/index.js';
export type { ChatHandlerOptions, ChatSession } from '../dist/index.js';
