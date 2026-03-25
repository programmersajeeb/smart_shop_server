const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/error");

const app = express();

// ✅ trust proxy fix
const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
app.set("trust proxy", trustProxy);

app.disable("x-powered-by");

// ✅ Helmet
app.use(helmet());

// ✅ Enterprise CORS
const NODE_ENV = process.env.NODE_ENV || "development";

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Dev helper: allow localhost + private LAN IPs only in non-production
const DEV_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

const DEV_PRIVATE_IP_RE =
  /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

function isOriginAllowed(origin) {
  if (!origin) return true; // curl/postman/mobile apps often have no Origin
  if (allowedOrigins.includes(origin)) return true;

  if (NODE_ENV !== "production") {
    if (DEV_ORIGIN_RE.test(origin)) return true;
    if (DEV_PRIVATE_IP_RE.test(origin)) return true;
  }

  return false;
}

const corsOptionsDelegate = (req, cb) => {
  const origin = req.header("Origin");
  const ok = isOriginAllowed(origin);

  if (!ok && NODE_ENV !== "production") {
    console.warn(`❌ Blocked CORS origin: ${origin}`);
  }

  cb(null, {
    origin: !origin ? true : ok ? origin : false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "If-Match",
      "X-Config-Version",
      "X-Firebase-Token",
    ],
    exposedHeaders: ["ETag", "X-Request-Id"],
    maxAge: 600,
  });
};

app.use(cors(corsOptionsDelegate));
app.options(/.*/, cors(corsOptionsDelegate));

// ✅ request id for tracing/debugging
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ✅ logs: dev only
if (NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ✅ global rate limit
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      message: "Too many requests, please try again later.",
    },
  })
);

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Smart Shop API is running" });
});

// static uploads
app.use("/uploads", express.static(process.env.UPLOAD_DIR || "uploads"));

app.get("/api/v1/health", (req, res) => {
  res.json({
    ok: true,
    requestId: req.requestId,
  });
});

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;