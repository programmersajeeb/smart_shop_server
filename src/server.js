require("dotenv").config();

process.on("uncaughtException", (err) => {
  console.error("❌ UncaughtException:", err);
  process.exit(1);
});

const app = require("./app");
const connectDB = require("./config/db");

const PORT = Number(process.env.PORT || 5000);
let server;

function requireEnv(keys) {
  const missing = keys.filter((k) => !String(process.env[k] || "").trim());
  if (missing.length) {
    console.error("❌ Missing required ENV:", missing.join(", "));
    console.error("✅ Fix: add them in .env (never commit secrets).");
    process.exit(1);
  }
}

requireEnv([
  "MONGO_URI",
  "CORS_ORIGIN",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
]);

process.on("unhandledRejection", (err) => {
  console.error("❌ UnhandledRejection:", err);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    const shutdown = (signal) => {
      console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("❌ Server boot failed:", err);
    process.exit(1);
  }
})();