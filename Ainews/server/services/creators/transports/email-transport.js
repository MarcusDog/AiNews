function createEmailTransport(options = {}) {
  const send = options.send;
  return async function emailTransport(delivery = {}) {
    if (typeof send !== 'function') return { status: 503, error: 'transport_unconfigured:email' };
    await send({
      to: delivery.endpoint?.destination,
      subject: `AyaNews · ${delivery.event?.eventType || 'Creator alert'}`,
      event: delivery.event,
      deliveryId: delivery.outboxId
    });
    return { status: 202 };
  };
}

module.exports = { createEmailTransport };
