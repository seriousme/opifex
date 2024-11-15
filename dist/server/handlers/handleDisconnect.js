export function handleDisconnect(ctx) {
    ctx.will = undefined;
    ctx.close();
}
