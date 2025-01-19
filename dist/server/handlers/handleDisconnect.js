/**
 * Handles client disconnection by clearing the will message and closing the connection
 * @param {Context} ctx - The connection context object
 * @returns {void}
 */
export function handleDisconnect(ctx) {
    ctx.will = undefined;
    ctx.close();
}
