const mongoose = require("mongoose");

module.exports = async function connectDB(MONGO_URI) {
  const uri = String(MONGO_URI || "").trim();
  if (!uri) throw new Error("MONGO_URI is missing");

  mongoose.set("strictQuery", true);

  mongoose.connection.on("error", (e) => {
    console.error("❌ MongoDB connection error:", e);
  });

  await mongoose.connect(uri, {
    autoIndex: String(process.env.NODE_ENV || "").toLowerCase() !== "production",
  });

  console.log("✅ MongoDB connected");
};
