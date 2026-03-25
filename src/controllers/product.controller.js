const Product = require("../models/Product");
const PageConfig = require("../models/PageConfig");
const AdminAuditLog = require("../models/AdminAuditLog");
const ApiError = require("../utils/apiError");

/**
 * ============================================================
 * Products Controller (Enterprise-ready)
 * ------------------------------------------------------------
 * ✅ Public list: search + pagination + sorting + filters
 * ✅ Public list: excludeId / excludeIds support
 * ✅ Facets: categories/brands + counts + price range
 * ✅ Admin list: includes inactive products + inventory filters
 * ✅ CRUD: keeps titleLower in sync
 * ✅ Admin Categories: aggregated view + rename/delete
 * ✅ Inventory Summary: KPI cards for inventory module
 * ✅ Bulk Inventory Update: stock/threshold update for selected products
 * ✅ Homepage payload: curated home sections for enterprise storefront
 * ✅ Audit logging (best-effort, never breaks flows)
 * ============================================================
 */

function parseBool(v) {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes";
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidObjectIdString(id) {
  return /^[0-9a-fA-F]{24}$/.test(String(id || "").trim());
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toPositiveNumberOrDefault(v, fallback = null) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function buildCaseInsensitiveExactRegex(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return new RegExp(`^${escapeRegex(text)}$`, "i");
}

function normalizeIdList(input) {
  const source = Array.isArray(input)
    ? input
    : String(input || "")
        .split(",")
        .map((item) => item.trim());

  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim())
        .filter((item) => isValidObjectIdString(item))
    )
  );
}

function normalizeImageItem(raw) {
  if (!raw) return null;

  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;

    return {
      fileId: null,
      url,
      filename: null,
      mimetype: null,
      size: 0,
      width: null,
      height: null,
      format: null,
    };
  }

  if (typeof raw !== "object") return null;

  const url = String(raw.url || "").trim();
  if (!url) return null;

  return {
    fileId: normalizeText(raw.fileId),
    url,
    filename: normalizeText(raw.filename),
    mimetype: normalizeText(raw.mimetype),
    size: toPositiveNumberOrDefault(raw.size, 0),
    width: toPositiveNumberOrDefault(raw.width, null),
    height: toPositiveNumberOrDefault(raw.height, null),
    format: normalizeText(raw.format),
  };
}

function normalizeImages(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const img = normalizeImageItem(raw);
    if (!img) continue;

    const key = String(img.url || "").toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(img);
  }

  return out.slice(0, 20);
}

function pickProductSnapshot(p) {
  if (!p) return null;
  const id = p._id != null ? String(p._id) : null;

  return {
    id,
    title: p.title,
    price: p.price,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    category: p.category,
    brand: p.brand,
    isActive: p.isActive,
    images: Array.isArray(p.images) ? p.images : [],
    compareAtPrice: Number(p?.compareAtPrice || 0),
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
  };
}

async function logAction(req, payload) {
  try {
    const actor = req.user?.sub ? String(req.user.sub) : null;
    if (!actor || !isValidObjectIdString(actor)) return;

    const action = String(payload.action || "").trim();
    const entity = String(payload.entity || "").trim();
    if (!action || !entity) return;

    const entityId =
      payload.entityId && isValidObjectIdString(payload.entityId)
        ? String(payload.entityId)
        : null;

    await AdminAuditLog.create({
      actor,
      action,
      entity,
      entityId,
      before: payload.before ?? null,
      after: payload.after ?? null,
      meta: {
        ip: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        path: req.originalUrl || req.url || null,
        method: req.method || null,
        requestId: req.requestId || null,
        ...(payload.meta && typeof payload.meta === "object" ? payload.meta : {}),
      },
    });
  } catch {
    // ignore audit logging failure
  }
}

function applySearchFilter(filter, q) {
  const qs = String(q || "").trim();
  if (!qs) return;

  const rx = new RegExp(escapeRegex(qs), "i");
  filter.$or = [
    { title: rx },
    { titleLower: rx },
    { description: rx },
    { category: rx },
    { brand: rx },
  ];
}

function pickPrimaryImageUrl(product) {
  const first = Array.isArray(product?.images) ? product.images[0] : null;
  if (typeof first === "string") return first || null;
  if (first && typeof first === "object") return normalizeText(first.url);
  return null;
}

function trimText(value, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function mapProductCard(product) {
  return {
    _id: product?._id,
    id: product?._id ? String(product._id) : null,
    title: product?.title || "",
    description: trimText(product?.description || "", 140),
    price: Number(product?.price || 0),
    compareAtPrice: Number(product?.compareAtPrice || 0),
    stock: Number(product?.stock || 0),
    lowStockThreshold: Number(product?.lowStockThreshold || 0),
    category: normalizeText(product?.category),
    brand: normalizeText(product?.brand),
    images: Array.isArray(product?.images) ? product.images : [],
    image: pickPrimaryImageUrl(product),
    isActive: Boolean(product?.isActive),
    createdAt: product?.createdAt || null,
    updatedAt: product?.updatedAt || null,
  };
}

function mergePublicProduct(product) {
  return {
    ...(product || {}),
    ...mapProductCard(product),
  };
}

function uniqueProducts(list = [], limit = 8) {
  const out = [];
  const seen = new Set();

  for (const item of list) {
    const id = String(item?._id || item?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= limit) break;
  }

  return out;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCollections(rows = []) {
  return rows.slice(0, 6).map((row, index) => ({
    id: slugify(row?._id || `collection-${index + 1}`) || `collection-${index + 1}`,
    title: String(row?._id || "Collection").trim(),
    count: Number(row?.count || 0),
    image: normalizeText(row?.image || null),
    href: `/shop?category=${encodeURIComponent(String(row?._id || "").trim())}`,
  }));
}

function buildStyleOptions(products = []) {
  const list = Array.isArray(products) ? products : [];

  const categoryMap = new Map();
  const brandMap = new Map();

  for (const product of list) {
    const category = normalizeText(product?.category);
    const brand = normalizeText(product?.brand);
    const image = pickPrimaryImageUrl(product);

    if (category && !categoryMap.has(category)) {
      categoryMap.set(category, image || null);
    }

    if (brand && !brandMap.has(brand)) {
      brandMap.set(brand, image || null);
    }
  }

  const styles = [];

  for (const [name, image] of Array.from(categoryMap.entries()).slice(0, 4)) {
    styles.push({
      id: `category-${slugify(name)}`,
      label: name,
      href: `/shop?category=${encodeURIComponent(name)}`,
      type: "category",
      image: image || null,
      img: image || null,
    });
  }

  for (const [name, image] of Array.from(brandMap.entries()).slice(0, 4)) {
    if (styles.length >= 8) break;

    styles.push({
      id: `brand-${slugify(name)}`,
      label: name,
      href: `/shop?brand=${encodeURIComponent(name)}`,
      type: "brand",
      image: image || null,
      img: image || null,
    });
  }

  return styles.slice(0, 8);
}

function buildInstagramFeed(products = []) {
  return products.slice(0, 6).map((p, index) => ({
    id: String(p?._id || `ig-${index + 1}`),
    image: pickPrimaryImageUrl(p),
    title: p?.title || "Shop the look",
    href: `/shop?q=${encodeURIComponent(String(p?.title || "").trim())}`,
  }));
}

function sanitizeHomeText(value, max = 200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trim() : text;
}

function sanitizeHomeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("/")) return text;

  try {
    const u = new URL(text);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return text;
    }
    return "";
  } catch {
    return "";
  }
}

function clampHomeInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeFacetRows(rows = []) {
  return rows
    .map((row) => {
      const value = normalizeText(row?._id);
      if (!value) return null;

      return {
        value,
        label: value,
        count: Number(row?.count || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}

// GET /products (public)
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();

    const filter = { isActive: true };

    const category = normalizeText(req.query.category);
    const brand = normalizeText(req.query.brand);

    const categoryRegex = buildCaseInsensitiveExactRegex(category);
    const brandRegex = buildCaseInsensitiveExactRegex(brand);

    if (categoryRegex) filter.category = categoryRegex;
    if (brandRegex) filter.brand = brandRegex;

    if (parseBool(req.query.inStock)) {
      filter.stock = { $gt: 0 };
    }

    const excludeIds = normalizeIdList(
      req.query.excludeIds || req.query.excludeId || req.query.exclude
    );
    if (excludeIds.length) {
      filter._id = { $nin: excludeIds };
    }

    const priceMin = parseNum(req.query.priceMin);
    const priceMax = parseNum(req.query.priceMax);

    if (priceMin != null && priceMin < 0) {
      throw new ApiError(400, "Invalid priceMin");
    }

    if (priceMax != null && priceMax < 0) {
      throw new ApiError(400, "Invalid priceMax");
    }

    if (priceMin != null || priceMax != null) {
      filter.price = {};
      if (priceMin != null) filter.price.$gte = priceMin;
      if (priceMax != null) filter.price.$lte = priceMax;

      if (
        filter.price.$gte != null &&
        filter.price.$lte != null &&
        filter.price.$gte > filter.price.$lte
      ) {
        throw new ApiError(400, "priceMin cannot be greater than priceMax");
      }
    }

    applySearchFilter(filter, q);

    const sort =
      req.query.sort === "price_asc"
        ? { price: 1, updatedAt: -1, _id: -1 }
        : req.query.sort === "price_desc"
          ? { price: -1, updatedAt: -1, _id: -1 }
          : { updatedAt: -1, createdAt: -1, _id: -1 };

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    const products = items.map(mergePublicProduct);

    res.json({
      ok: true,
      products,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      skip,
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/facets (public)
exports.facets = async (req, res, next) => {
  try {
    const match = { isActive: true };

    const [categoryRows, brandRows, priceAgg] = await Promise.all([
      Product.aggregate([
        { $match: { ...match, category: { $nin: [null, ""] } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Product.aggregate([
        { $match: { ...match, brand: { $nin: [null, ""] } } },
        { $group: { _id: "$brand", count: { $sum: 1 } } },
      ]),
      Product.aggregate([
        { $match: match },
        { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
      ]),
    ]);

    const min = priceAgg?.[0]?.min ?? 0;
    const max = priceAgg?.[0]?.max ?? 0;

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      ok: true,
      categories: normalizeFacetRows(categoryRows),
      brands: normalizeFacetRows(brandRows),
      price: { min, max },
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/home (public)
exports.home = async (_req, res, next) => {
  try {
    const activeMatch = { isActive: true };
    const inStockMatch = { isActive: true, stock: { $gt: 0 } };

    const [
      homeCfgDoc,
      latestProducts,
      cheapestProducts,
      featuredProducts,
      collectionAgg,
      allBrands,
      allCategories,
      priceAgg,
      activeCount,
    ] = await Promise.all([
      PageConfig.findOne({ key: "home" }).lean(),
      Product.find(inStockMatch)
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .limit(16)
        .lean(),
      Product.find(inStockMatch)
        .sort({ price: 1, updatedAt: -1, _id: -1 })
        .limit(12)
        .lean(),
      Product.find(activeMatch)
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .limit(16)
        .lean(),
      Product.aggregate([
        { $match: activeMatch },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
            image: { $first: { $arrayElemAt: ["$images.url", 0] } },
          },
        },
        { $match: { _id: { $nin: [null, ""] } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 6 },
      ]),
      Product.distinct("brand", { ...activeMatch, brand: { $nin: [null, ""] } }),
      Product.distinct("category", { ...activeMatch, category: { $nin: [null, ""] } }),
      Product.aggregate([
        { $match: activeMatch },
        { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
      ]),
      Product.countDocuments(activeMatch),
    ]);

    const homeCfg = homeCfgDoc?.data || {};

    const latestCards = latestProducts.map(mapProductCard);
    const cheapestCards = cheapestProducts.map(mapProductCard);
    const featuredCards = featuredProducts.map(mapProductCard);

    const trendingProducts = uniqueProducts(latestCards, 4);
    const bestSellerProducts = uniqueProducts([...latestCards, ...featuredCards], 8);
    const flashSaleProducts = uniqueProducts(cheapestCards, 4);

    const priceMin = Number(priceAgg?.[0]?.min ?? 0);
    const priceMax = Number(priceAgg?.[0]?.max ?? 0);
    const priceMid = Math.max(priceMin, Math.round((priceMin + priceMax) / 2));

    const collections = buildCollections(collectionAgg);
    const shopByStyle = buildStyleOptions([...latestProducts, ...featuredProducts]);
    const instagramFeed = buildInstagramFeed([...latestProducts, ...featuredProducts]);

    const safeCategory =
      normalizeText(collectionAgg?.[0]?._id) ||
      normalizeText(allCategories?.[0]) ||
      "Collection";

    const fallbackHeroImage =
      pickPrimaryImageUrl(latestProducts[0]) ||
      pickPrimaryImageUrl(featuredProducts[0]) ||
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=1400&auto=format&fit=crop";

    const fallbackSeasonalImage =
      pickPrimaryImageUrl(featuredProducts[1]) ||
      pickPrimaryImageUrl(cheapestProducts[0]) ||
      fallbackHeroImage;

    const fallbackBrandStoryImage =
      pickPrimaryImageUrl(featuredProducts[2]) ||
      pickPrimaryImageUrl(latestProducts[1]) ||
      fallbackHeroImage;

    const heroCfg = homeCfg?.hero || {};
    const collectionsCfg = homeCfg?.collections || {};
    const trendingCfg = homeCfg?.trending || {};
    const bestCfg = homeCfg?.bestSellers || {};
    const flashCfg = homeCfg?.flashSale || {};
    const whyCfg = homeCfg?.whyChooseUs || {};
    const testimonialsCfg = homeCfg?.testimonials || {};
    const seasonalCfg = homeCfg?.seasonalBanner || {};
    const priceCfg = homeCfg?.shopByPrice || {};
    const styleCfg = homeCfg?.shopByStyle || {};
    const feedCfg = homeCfg?.instagramFeed || {};
    const brandStoryCfg = homeCfg?.brandStory || {};
    const newsletterCfg = homeCfg?.newsletter || {};

    const heroStats =
      Array.isArray(heroCfg?.stats) && heroCfg.stats.length
        ? heroCfg.stats
            .map((item, index) => {
              const label = sanitizeHomeText(item?.label, 40) || `Stat ${index + 1}`;
              let value = sanitizeHomeText(item?.value, 40);

              if (!value) {
                if (/active products/i.test(label)) value = String(activeCount || 0);
                else if (/collections/i.test(label)) {
                  value = String((collections || []).length || 0);
                } else if (/brands/i.test(label)) {
                  value = String((allBrands || []).filter(Boolean).length || 0);
                }
              }

              return {
                label,
                value: value || "--",
              };
            })
            .slice(0, 6)
        : [
            { label: "Active products", value: String(activeCount || 0) },
            { label: "Collections", value: String((collections || []).length || 0) },
            { label: "Brands", value: String((allBrands || []).filter(Boolean).length || 0) },
          ];

    const shopByPriceItems =
      Array.isArray(priceCfg?.items) && priceCfg.items.length
        ? priceCfg.items.slice(0, 3).map((item, index) => ({
            id: sanitizeHomeText(item?.id, 60) || `price-${index + 1}`,
            label: sanitizeHomeText(item?.label, 80) || `Price range ${index + 1}`,
            href:
              sanitizeHomeUrl(item?.href) ||
              [
                `/shop?priceMax=${encodeURIComponent(String(priceMid || 0))}`,
                `/shop?priceMin=${encodeURIComponent(String(priceMid || 0))}`,
                `/shop?priceMax=${encodeURIComponent(String(priceMid || 0))}&inStock=true`,
              ][index] ||
              "/shop",
          }))
        : [
            {
              id: "under-mid",
              label: "Under budget",
              href: `/shop?priceMax=${encodeURIComponent(String(priceMid || 0))}`,
            },
            {
              id: "premium-range",
              label: "Premium range",
              href: `/shop?priceMin=${encodeURIComponent(String(priceMid || 0))}`,
            },
            {
              id: "in-stock-value",
              label: "In stock deals",
              href: `/shop?priceMax=${encodeURIComponent(String(priceMid || 0))}&inStock=true`,
            },
          ];

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      ok: true,
      home: {
        hero: {
          eyebrow: sanitizeHomeText(heroCfg?.eyebrow, 40) || "New arrivals",
          title:
            sanitizeHomeText(heroCfg?.title, 140) ||
            "Elevate your everyday wardrobe with refined essentials",
          description:
            sanitizeHomeText(heroCfg?.description, 320) ||
            "Discover premium pieces curated from your live catalog, designed for comfort, confidence, and modern style.",
          image: sanitizeHomeUrl(heroCfg?.image) || fallbackHeroImage,
          primaryCta: {
            label: sanitizeHomeText(heroCfg?.primaryCtaLabel, 40) || "Shop collection",
            href:
              sanitizeHomeUrl(heroCfg?.primaryCtaHref) ||
              `/shop?category=${encodeURIComponent(safeCategory)}`,
          },
          secondaryCta: {
            label: sanitizeHomeText(heroCfg?.secondaryCtaLabel, 40) || "Explore latest",
            href: sanitizeHomeUrl(heroCfg?.secondaryCtaHref) || "/shop?sort=latest",
          },
          stats: heroStats,
        },

        collections: {
          title: sanitizeHomeText(collectionsCfg?.title, 80) || "Explore Our Collections",
          subtitle:
            sanitizeHomeText(collectionsCfg?.subtitle, 220) ||
            "Curated categories from your live catalog to help customers discover products faster.",
          items: collections,
        },

        trending: {
          title: sanitizeHomeText(trendingCfg?.title, 80) || "Trending Now",
          subtitle:
            sanitizeHomeText(trendingCfg?.subtitle, 220) ||
            "Fresh picks from your most recently updated in-stock catalog.",
          products: trendingProducts,
          cta: {
            label: sanitizeHomeText(trendingCfg?.ctaLabel, 40) || "View all products",
            href: sanitizeHomeUrl(trendingCfg?.ctaHref) || "/shop",
          },
        },

        bestSellers: {
          title: sanitizeHomeText(bestCfg?.title, 80) || "Best Sellers",
          subtitle:
            sanitizeHomeText(bestCfg?.subtitle, 220) ||
            "A curated storefront mix from the newest and most relevant active products.",
          products: bestSellerProducts,
          cta: {
            label: sanitizeHomeText(bestCfg?.ctaLabel, 40) || "Browse best picks",
            href: sanitizeHomeUrl(bestCfg?.ctaHref) || "/shop?sort=latest",
          },
        },

        flashSale: {
          title: sanitizeHomeText(flashCfg?.title, 80) || "Flash Sale",
          subtitle:
            sanitizeHomeText(flashCfg?.subtitle, 220) ||
            "Value-first picks from the lowest-priced items currently in stock.",
          products: flashSaleProducts,
          cta: {
            label: sanitizeHomeText(flashCfg?.ctaLabel, 40) || "Shop deals",
            href:
              sanitizeHomeUrl(flashCfg?.ctaHref) ||
              `/shop?priceMax=${encodeURIComponent(String(priceMid || 0))}&inStock=true`,
          },
        },

        whyChooseUs: {
          title: sanitizeHomeText(whyCfg?.title, 80) || "Why Choose Us",
          items:
            Array.isArray(whyCfg?.items) && whyCfg.items.length
              ? whyCfg.items.slice(0, 6).map((item, index) => ({
                  id: sanitizeHomeText(item?.id, 60) || `why-${index + 1}`,
                  title: sanitizeHomeText(item?.title, 80) || "Feature",
                  description: sanitizeHomeText(item?.description, 220) || "",
                }))
              : [
                  {
                    id: "quality",
                    title: "Premium quality",
                    description:
                      "Thoughtfully selected products with dependable quality and presentation.",
                  },
                  {
                    id: "fast",
                    title: "Fast fulfillment",
                    description:
                      "Operationally ready catalog with inventory-aware shopping experience.",
                  },
                  {
                    id: "secure",
                    title: "Secure checkout",
                    description:
                      "Built for smooth customer journeys across discovery, cart, and purchase.",
                  },
                ],
        },

        testimonials: {
          title: sanitizeHomeText(testimonialsCfg?.title, 80) || "What Customers Say",
          items:
            Array.isArray(testimonialsCfg?.items) && testimonialsCfg.items.length
              ? testimonialsCfg.items.slice(0, 10).map((item, index) => ({
                  id: sanitizeHomeText(item?.id, 60) || `t-${index + 1}`,
                  name: sanitizeHomeText(item?.name, 60) || "Customer",
                  quote: sanitizeHomeText(item?.quote, 220) || "",
                  rating: clampHomeInt(item?.rating, 1, 5, 5),
                }))
              : [
                  {
                    id: "t1",
                    name: "Ava Rahman",
                    quote:
                      "The storefront feels premium and the product selection is genuinely useful.",
                    rating: 5,
                  },
                  {
                    id: "t2",
                    name: "Nabil Hasan",
                    quote:
                      "Clean shopping flow, quality products, and a much more polished browsing experience.",
                    rating: 5,
                  },
                  {
                    id: "t3",
                    name: "Sarah Ahmed",
                    quote:
                      "I found what I needed quickly, and the catalog felt modern and trustworthy.",
                    rating: 5,
                  },
                ],
        },

        seasonalBanner: {
          eyebrow: sanitizeHomeText(seasonalCfg?.eyebrow, 40) || "Seasonal edit",
          title:
            sanitizeHomeText(seasonalCfg?.title, 120) ||
            "Refresh your wardrobe with the latest curated arrivals",
          description:
            sanitizeHomeText(seasonalCfg?.description, 260) ||
            "Explore timely essentials and standout pieces crafted to keep your catalog feeling current.",
          image: sanitizeHomeUrl(seasonalCfg?.image) || fallbackSeasonalImage,
          cta: {
            label: sanitizeHomeText(seasonalCfg?.ctaLabel, 40) || "Shop seasonal picks",
            href: sanitizeHomeUrl(seasonalCfg?.ctaHref) || "/shop?sort=latest",
          },
        },

        shopByPrice: {
          title: sanitizeHomeText(priceCfg?.title, 80) || "Shop by Price",
          subtitle:
            sanitizeHomeText(priceCfg?.subtitle, 220) ||
            "Budget-aware shopping paths that help customers discover the right products faster.",
          items: shopByPriceItems,
          meta: {
            min: priceMin,
            max: priceMax,
            mid: priceMid,
          },
        },

        shopByStyle: {
          title: sanitizeHomeText(styleCfg?.title, 80) || "Shop by Style",
          subtitle:
            sanitizeHomeText(styleCfg?.subtitle, 220) ||
            "Fast discovery paths based on category and brand-led shopping intent.",
          items: shopByStyle,
        },

        instagramFeed: {
          title: sanitizeHomeText(feedCfg?.title, 80) || "Inspired by the Feed",
          subtitle:
            sanitizeHomeText(feedCfg?.subtitle, 220) ||
            "Editorial-style product inspiration built from your live catalog.",
          items: instagramFeed,
        },

        brandStory: {
          eyebrow: sanitizeHomeText(brandStoryCfg?.eyebrow, 40) || "Our story",
          title:
            sanitizeHomeText(brandStoryCfg?.title, 140) ||
            "Built for a cleaner, smarter modern shopping experience",
          description:
            sanitizeHomeText(brandStoryCfg?.description, 320) ||
            "This storefront blends structured catalog data, strong merchandising foundations, and scalable customer journeys to create a more premium digital retail experience.",
          image: sanitizeHomeUrl(brandStoryCfg?.image) || fallbackBrandStoryImage,
          cta: {
            label: sanitizeHomeText(brandStoryCfg?.ctaLabel, 40) || "Explore the catalog",
            href: sanitizeHomeUrl(brandStoryCfg?.ctaHref) || "/shop",
          },
        },

        newsletter: {
          title: sanitizeHomeText(newsletterCfg?.title, 80) || "Join our newsletter",
          description:
            sanitizeHomeText(newsletterCfg?.description, 220) ||
            "Get product highlights, new arrivals, and curated seasonal picks delivered to your inbox.",
          placeholder:
            sanitizeHomeText(newsletterCfg?.placeholder, 80) || "Enter your email",
          buttonLabel:
            sanitizeHomeText(newsletterCfg?.buttonLabel, 40) || "Subscribe",
        },
      },
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/admin (admin)
exports.listAdmin = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const filter = {};

    const category = normalizeText(req.query.category);
    const brand = normalizeText(req.query.brand);

    if (category) filter.category = category;
    if (brand) filter.brand = brand;

    if (req.query.isActive !== undefined && req.query.isActive !== "") {
      filter.isActive = parseBool(req.query.isActive);
    }

    const stockFilter = String(req.query.stock || "").trim().toLowerCase();
    if (stockFilter === "out") {
      filter.stock = { $lte: 0 };
    } else if (stockFilter === "low") {
      filter.$expr = {
        $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }],
      };
    } else if (stockFilter === "ok") {
      filter.$expr = { $gt: ["$stock", "$lowStockThreshold"] };
    }

    if (parseBool(req.query.inStock)) {
      filter.stock = { $gt: 0 };
      delete filter.$expr;
    }

    const priceMin = parseNum(req.query.priceMin);
    const priceMax = parseNum(req.query.priceMax);

    if (priceMin != null && priceMin < 0) {
      throw new ApiError(400, "Invalid priceMin");
    }

    if (priceMax != null && priceMax < 0) {
      throw new ApiError(400, "Invalid priceMax");
    }

    if (priceMin != null || priceMax != null) {
      filter.price = {};
      if (priceMin != null) filter.price.$gte = priceMin;
      if (priceMax != null) filter.price.$lte = priceMax;

      if (
        filter.price.$gte != null &&
        filter.price.$lte != null &&
        filter.price.$gte > filter.price.$lte
      ) {
        throw new ApiError(400, "priceMin cannot be greater than priceMax");
      }
    }

    applySearchFilter(filter, q);

    const sort =
      req.query.sort === "price_asc"
        ? { price: 1, _id: -1 }
        : req.query.sort === "price_desc"
          ? { price: -1, _id: -1 }
          : req.query.sort === "stock_asc"
            ? { stock: 1, updatedAt: -1, _id: -1 }
            : req.query.sort === "stock_desc"
              ? { stock: -1, updatedAt: -1, _id: -1 }
              : req.query.sort === "updated_asc"
                ? { updatedAt: 1, _id: -1 }
                : req.query.sort === "updated_desc"
                  ? { updatedAt: -1, _id: -1 }
                  : { createdAt: -1, _id: -1 };

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      ok: true,
      products: items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      skip,
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/admin/categories
exports.adminCategories = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();

    const match = { category: { $nin: [null, ""] } };

    if (q) {
      match.category = { $nin: [null, ""], $regex: escapeRegex(q), $options: "i" };
    }

    const rows = await Product.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$category",
          name: { $first: "$category" },
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
          inStockCount: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          outOfStockCount: { $sum: { $cond: [{ $lte: ["$stock", 0] }, 1, 0] } },
          lowStockCount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] },
                1,
                0,
              ],
            },
          },
          totalStock: { $sum: "$stock" },
        },
      },
      { $sort: { count: -1, name: 1 } },
    ]);

    res.json({
      ok: true,
      categories: rows,
    });
  } catch (e) {
    next(e);
  }
};

// POST /products/admin/categories/rename
exports.renameCategory = async (req, res, next) => {
  try {
    const from = String(req.body?.from || "").trim();
    const to = String(req.body?.to || "").trim();

    if (!from) throw new ApiError(400, "from required");
    if (!to) throw new ApiError(400, "to required");
    if (from === to) {
      return res.json({ ok: true, from, to, matched: 0, modified: 0 });
    }

    const beforeCount = await Product.countDocuments({ category: from });

    const r = await Product.updateMany(
      { category: from },
      { $set: { category: to, updatedAt: new Date() } }
    );

    await logAction(req, {
      action: "category.rename",
      entity: "category",
      entityId: null,
      before: { category: from, affected: beforeCount },
      after: { category: to, modified: r.modifiedCount ?? r.nModified ?? 0 },
      meta: { from, to },
    });

    res.json({
      ok: true,
      from,
      to,
      matched: r.matchedCount ?? r.n ?? 0,
      modified: r.modifiedCount ?? r.nModified ?? 0,
    });
  } catch (e) {
    next(e);
  }
};

// POST /products/admin/categories/delete
exports.deleteCategory = async (req, res, next) => {
  try {
    const category = String(req.body?.category || "").trim();
    if (!category) throw new ApiError(400, "category required");

    const beforeCount = await Product.countDocuments({ category });

    const r = await Product.updateMany(
      { category },
      { $set: { category: null, updatedAt: new Date() } }
    );

    await logAction(req, {
      action: "category.delete",
      entity: "category",
      entityId: null,
      before: { category, affected: beforeCount },
      after: { category: null, modified: r.modifiedCount ?? r.nModified ?? 0 },
      meta: { category },
    });

    res.json({
      ok: true,
      category,
      matched: r.matchedCount ?? r.n ?? 0,
      modified: r.modifiedCount ?? r.nModified ?? 0,
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/admin/inventory-summary
exports.inventorySummary = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = {};

    const category = normalizeText(req.query.category);
    const brand = normalizeText(req.query.brand);

    if (category) filter.category = category;
    if (brand) filter.brand = brand;

    if (req.query.isActive !== undefined && req.query.isActive !== "") {
      filter.isActive = parseBool(req.query.isActive);
    }

    applySearchFilter(filter, q);

    const rows = await Product.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] } },
          inStock: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $lte: ["$stock", 0] }, 1, 0] } },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] },
                1,
                0,
              ],
            },
          },
          totalStock: { $sum: "$stock" },
        },
      },
    ]);

    const s = rows?.[0] || {};
    res.json({
      ok: true,
      summary: {
        total: s.total || 0,
        active: s.active || 0,
        inactive: s.inactive || 0,
        inStock: s.inStock || 0,
        outOfStock: s.outOfStock || 0,
        lowStock: s.lowStock || 0,
        totalStock: s.totalStock || 0,
      },
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /products/admin/bulk-stock
exports.bulkStockUpdate = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) throw new ApiError(400, "ids required");
    if (ids.length > 200) throw new ApiError(400, "Too many ids (max 200)");

    const cleanIds = Array.from(
      new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))
    );

    for (const id of cleanIds) {
      if (!isValidObjectIdString(id)) {
        throw new ApiError(400, `Invalid id: ${id}`);
      }
    }

    const update = {};

    if (req.body?.stock != null) {
      const n = Number(req.body.stock);
      if (!Number.isFinite(n) || n < 0) throw new ApiError(400, "Invalid stock");
      update.stock = Math.max(0, n);
    }

    if (req.body?.lowStockThreshold != null) {
      const n = Number(req.body.lowStockThreshold);
      if (!Number.isFinite(n) || n < 0) {
        throw new ApiError(400, "Invalid lowStockThreshold");
      }
      update.lowStockThreshold = Math.max(0, n);
    }

    if (!Object.keys(update).length) {
      throw new ApiError(400, "Nothing to update");
    }

    const beforeSample = await Product.find({ _id: { $in: cleanIds } })
      .select(
        "title price stock lowStockThreshold category brand isActive images compareAtPrice updatedAt createdAt"
      )
      .limit(10)
      .lean();

    update.updatedAt = new Date();

    const r = await Product.updateMany({ _id: { $in: cleanIds } }, { $set: update });

    const afterSample = await Product.find({ _id: { $in: cleanIds } })
      .select(
        "title price stock lowStockThreshold category brand isActive images compareAtPrice updatedAt createdAt"
      )
      .limit(10)
      .lean();

    await logAction(req, {
      action: "inventory.bulkUpdate",
      entity: "product",
      entityId: null,
      before: { sample: beforeSample.map(pickProductSnapshot), idsCount: cleanIds.length },
      after: {
        sample: afterSample.map(pickProductSnapshot),
        update,
        idsCount: cleanIds.length,
        modified: r.modifiedCount ?? r.nModified ?? 0,
      },
      meta: { update, idsCount: cleanIds.length },
    });

    res.json({
      ok: true,
      matched: r.matchedCount ?? r.n ?? 0,
      modified: r.modifiedCount ?? r.nModified ?? 0,
      update,
    });
  } catch (e) {
    next(e);
  }
};

exports.bulkStock = exports.bulkStockUpdate;
exports.updateBulkStock = exports.bulkStockUpdate;
exports.adminBulkStock = exports.bulkStockUpdate;

// GET /products/:id (public)
exports.getOne = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!isValidObjectIdString(id)) throw new ApiError(400, "Invalid id");

    const item = await Product.findById(id).lean();
    if (!item) {
      throw new ApiError(404, "Product not found");
    }

    if (!item.isActive) {
      throw new ApiError(404, "Product not found");
    }

    res.json({
      ok: true,
      product: mergePublicProduct(item),
    });
  } catch (e) {
    next(e);
  }
};

// POST /products (admin)
exports.create = async (req, res, next) => {
  try {
    const {
      title,
      description,
      price,
      compareAtPrice,
      stock,
      lowStockThreshold,
      category,
      brand,
      images,
    } = req.body || {};

    const titleStr = String(title || "").trim();
    if (!titleStr) throw new ApiError(400, "title required");

    if (price == null || Number.isNaN(Number(price))) {
      throw new ApiError(400, "price required");
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      throw new ApiError(400, "Invalid price");
    }

    const compareAtPriceNum =
      compareAtPrice == null || compareAtPrice === ""
        ? null
        : Number(compareAtPrice);

    if (
      compareAtPriceNum != null &&
      (!Number.isFinite(compareAtPriceNum) || compareAtPriceNum < 0)
    ) {
      throw new ApiError(400, "Invalid compareAtPrice");
    }

    const stockNum = Number(stock || 0);
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      throw new ApiError(400, "Invalid stock");
    }

    const thresholdNum =
      lowStockThreshold == null || Number.isNaN(Number(lowStockThreshold))
        ? 5
        : Number(lowStockThreshold);

    if (!Number.isFinite(thresholdNum) || thresholdNum < 0) {
      throw new ApiError(400, "Invalid lowStockThreshold");
    }

    const normalizedImages = normalizeImages(images);

    const doc = await Product.create({
      title: titleStr,
      titleLower: titleStr.toLowerCase(),
      description: String(description || "").trim(),
      price: priceNum,
      compareAtPrice:
        compareAtPriceNum != null ? Math.max(0, compareAtPriceNum) : undefined,
      stock: Math.max(0, stockNum),
      lowStockThreshold: Math.max(0, thresholdNum),
      category: normalizeText(category),
      brand: normalizeText(brand),
      images: normalizedImages,
      isActive: true,
    });

    await logAction(req, {
      action: "product.create",
      entity: "product",
      entityId: doc._id,
      after: pickProductSnapshot(doc),
      meta: {
        imagesCount: normalizedImages.length,
      },
    });

    res.status(201).json({
      ok: true,
      product: doc,
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /products/:id (admin)
exports.update = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!isValidObjectIdString(id)) throw new ApiError(400, "Invalid id");

    const body = req.body || {};

    const beforeDoc = await Product.findById(id);
    if (!beforeDoc) throw new ApiError(404, "Product not found");

    const update = {};

    if (body.title != null) {
      const titleStr = String(body.title || "").trim();
      if (!titleStr) throw new ApiError(400, "Invalid title");
      update.title = titleStr;
      update.titleLower = titleStr.toLowerCase();
    }

    if (body.description != null) {
      update.description = String(body.description || "").trim();
    }

    if (body.price != null) {
      const priceNum = Number(body.price);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        throw new ApiError(400, "Invalid price");
      }
      update.price = priceNum;
    }

    if (body.compareAtPrice != null) {
      if (body.compareAtPrice === "") {
        update.compareAtPrice = null;
      } else {
        const compareAtPriceNum = Number(body.compareAtPrice);
        if (!Number.isFinite(compareAtPriceNum) || compareAtPriceNum < 0) {
          throw new ApiError(400, "Invalid compareAtPrice");
        }
        update.compareAtPrice = compareAtPriceNum;
      }
    }

    if (body.stock != null) {
      const stockNum = Number(body.stock);
      if (!Number.isFinite(stockNum) || stockNum < 0) {
        throw new ApiError(400, "Invalid stock");
      }
      update.stock = Math.max(0, stockNum);
    }

    if (body.lowStockThreshold != null) {
      const thresholdNum = Number(body.lowStockThreshold);
      if (!Number.isFinite(thresholdNum) || thresholdNum < 0) {
        throw new ApiError(400, "Invalid lowStockThreshold");
      }
      update.lowStockThreshold = Math.max(0, thresholdNum);
    }

    if (body.category != null) {
      update.category = normalizeText(body.category);
    }

    if (body.brand != null) {
      update.brand = normalizeText(body.brand);
    }

    if (body.images != null) {
      update.images = normalizeImages(body.images);
    }

    if (body.isActive != null) {
      update.isActive =
        typeof body.isActive === "boolean" ? body.isActive : parseBool(body.isActive);
    }

    if (!Object.keys(update).length) {
      throw new ApiError(400, "Nothing to update");
    }

    update.updatedAt = new Date();

    const afterDoc = await Product.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!afterDoc) throw new ApiError(404, "Product not found");

    await logAction(req, {
      action: "product.update",
      entity: "product",
      entityId: afterDoc._id,
      before: pickProductSnapshot(beforeDoc),
      after: pickProductSnapshot(afterDoc),
      meta: {
        fields: Object.keys(update),
        imagesCount: Array.isArray(afterDoc.images) ? afterDoc.images.length : 0,
      },
    });

    res.json({
      ok: true,
      product: afterDoc,
    });
  } catch (e) {
    next(e);
  }
};

// DELETE /products/:id (admin) => soft delete
exports.remove = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!isValidObjectIdString(id)) throw new ApiError(400, "Invalid id");

    const beforeDoc = await Product.findById(id);
    if (!beforeDoc) throw new ApiError(404, "Product not found");

    const doc = await Product.findByIdAndUpdate(
      id,
      { $set: { isActive: false, updatedAt: new Date() } },
      { new: true, runValidators: true }
    );

    if (!doc) throw new ApiError(404, "Product not found");

    await logAction(req, {
      action: "product.deactivate",
      entity: "product",
      entityId: doc._id,
      before: pickProductSnapshot(beforeDoc),
      after: pickProductSnapshot(doc),
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};