const amqp = require("amqplib");

const AMQP_URL = process.env.AMQP_URL || "amqp://guest:guest@localhost:5672";
const REQUEST_QUEUE = "order.stock.requested";
const RESULT_QUEUE = "order.stock.result";

let channel;

async function connect(retries = 20, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqp.connect(AMQP_URL);
      channel = await connection.createChannel();
      await channel.assertQueue(REQUEST_QUEUE, { durable: true });
      await channel.assertQueue(RESULT_QUEUE, { durable: true });
      console.log("🐇 Connected to RabbitMQ");
      return channel;
    } catch (error) {
      console.error(`🐇 RabbitMQ connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function publishRequest(payload) {
  channel.sendToQueue(REQUEST_QUEUE, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

function consumeResults(handler) {
  channel.consume(
    RESULT_QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString());
        await handler(payload);
        channel.ack(msg);
      } catch (error) {
        console.error("🐇 Failed to process stock result:", error.message);
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

module.exports = { connect, publishRequest, consumeResults };
