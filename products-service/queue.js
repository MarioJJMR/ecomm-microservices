const amqp = require("amqplib");

const AMQP_URL = process.env.AMQP_URL || "amqp://guest:guest@localhost:5672";
const REQUEST_QUEUE = "order.stock.requested";
const RESULT_QUEUE = "order.stock.result";

let channel;
let activeConsumer = null; // { queue, handler } — re-registered after every reconnect

async function connect(retries = 20, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqp.connect(AMQP_URL);
      channel = await connection.createChannel();
      await channel.assertQueue(REQUEST_QUEUE, { durable: true });
      await channel.assertQueue(RESULT_QUEUE, { durable: true });

      connection.on("error", (error) => {
        console.error("🐇 RabbitMQ connection error:", error.message);
      });
      // 'close' fires exactly once per connection lifecycle (after any error,
      // or on a broker-side disconnect) — without this, a dropped connection
      // leaves publish/consume silently dead until the process is restarted.
      connection.on("close", () => {
        console.error("🐇 RabbitMQ connection closed — reconnecting...");
        reconnect();
      });
      channel.on("error", (error) => {
        console.error("🐇 RabbitMQ channel error:", error.message);
      });

      console.log("🐇 Connected to RabbitMQ");
      return channel;
    } catch (error) {
      console.error(`🐇 RabbitMQ connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function reconnect() {
  try {
    await connect();
    if (activeConsumer) {
      registerConsumer(activeConsumer.queue, activeConsumer.handler);
    }
  } catch (error) {
    console.error("🐇 RabbitMQ reconnect failed permanently:", error.message);
  }
}

function registerConsumer(queueName, handler) {
  activeConsumer = { queue: queueName, handler };
  channel.consume(
    queueName,
    async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString());
        await handler(payload);
        channel.ack(msg);
      } catch (error) {
        console.error(`🐇 Failed to process message from ${queueName}:`, error.message);
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

function publishResult(payload) {
  channel.sendToQueue(RESULT_QUEUE, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

function consumeRequests(handler) {
  registerConsumer(REQUEST_QUEUE, handler);
}

module.exports = { connect, publishResult, consumeRequests };
