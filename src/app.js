const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/error");

const app = express();

// ✅ Enterprise: behind proxy (Render/Nginx/Cloudflare) safe IP + rate-limit accuracy
// Set TRUST_PROXY=1 in prod if behind reverse proxy
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.disable("x-powered-by");

// ✅ Helmet (ok as-is; keep simple)
app.use(helmet());

// ✅ Enterprise CORS: allowlist + dev private IP support + credentials safe
const NODE_ENV = process.env.NODE_ENV || "development";

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Dev helper: allow localhost + private LAN IPs (WiFi/SIM change safe) only in non-production
const DEV_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;
const DEV_PRIVATE_IP_RE =
  /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

function isOriginAllowed(origin) {
  if (!origin) return true; // curl/postman/mobile apps often have no Origin
  if (allowedOrigins.includes(origin)) return true;

  if (NODE_ENV !== "production") {
    // Dev: allow localhost + private IP origins automatically
    if (DEV_ORIGIN_RE.test(origin)) return true;
    if (DEV_PRIVATE_IP_RE.test(origin)) return true;
  }

  return false;
}

const corsOptionsDelegate = (req, cb) => {
  const origin = req.header("Origin");
  const ok = isOriginAllowed(origin);

  cb(null, {
    origin: ok ? origin || true : false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "If-Match", "X-Config-Version", "X-Firebase-Token"],
    exposedHeaders: ["ETag", "X-Request-Id"],
    maxAge: 600,
  });
};

app.use(cors(corsOptionsDelegate));
app.options(/.*/, cors(corsOptionsDelegate)); // ✅ preflight

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ logs: dev only (enterprise standard)
if (NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ✅ rate limit (enterprise baseline)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Smart Shop API is running" });
});

// static uploads (লোকাল ফাইল সার্ভ করতে)
app.use("/uploads", express.static(process.env.UPLOAD_DIR || "uploads"));

app.get("/api/v1/health", (req, res) => res.json({ ok: true }));

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
