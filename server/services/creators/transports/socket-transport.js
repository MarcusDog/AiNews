function createSocketTransport(options = {}) {
  const io = options.io;
  return async function socketTransport(delivery = {}) {
    if (!io?.to || !delivery.endpoint?.destination) return { status: 503, error: 'socket_unconfigured' };
    io.to(`user:${delivery.endpoint.destination}`).emit('creator-alert', {
      deliveryId: delivery.outboxId,
      event: delivery.event
    });
    return { status: 204 };
  };
}

module.exports = { createSocketTransport };
