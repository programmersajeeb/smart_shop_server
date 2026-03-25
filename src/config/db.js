const mongoose = require("mongoose");
const { initGridFS } = require("../services/gridfs.service");

module.exports = async function connectDB(MONGO_URI) {
  const uri = String(MONGO_URI || "").trim();
  if (!uri) throw new Error("MONGO_URI is missing");

  mongoose.set("strictQuery", true);

  mongoose.connection.on("error", (e) => {
    console.error("❌ MongoDB connection error:", e);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("✅ MongoDB reconnected");
    try {
      initGridFS();
    } catch (e) {
      console.error("❌ GridFS re-init failed:", e);
    }
  });

  await mongoose.connect(uri, {
    autoIndex:
      String(process.env.NODE_ENV || "").toLowerCase() !== "production",
    serverSelectionTimeoutMS: 10000,
  });

  initGridFS();

  console.log("✅ MongoDB connected");
};