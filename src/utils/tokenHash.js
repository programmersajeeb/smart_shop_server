const crypto = require("crypto");

function sha256(input) {
  const value = String(input || "").trim();

  if (!value) {
    throw new Error("sha256: input is required");
  }

  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = { sha256 };