const PageConfig = require("../models/PageConfig");
const AdminAuditLog = require("../models/AdminAuditLog");
const ApiError = require("../utils/apiError");

/**
 * Public: GET /page-config/shop
 * Admin : PUT /page-config/shop
 *
 * Public: GET /page-config/home
 * Admin : PUT /page-config/home
 *
 * Public: GET /page-config/admin-settings/public
 * Admin : GET /page-config/admin-settings
 * Admin : PUT /page-config/admin-settings
 */

const ALLOWED_ICON_KEYS = new Set([
  "ShoppingBag",
  "Shirt",
  "Watch",
  "Gem",
  "Baby",
  "Gift",
]);
const ALLOWED_SHOP_SORTS = new Set(["newest", "priceLow", "priceHigh"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function defaultShopConfig() {
  return {
    heroEyebrow: "Premium catalog",
    heroTitle: "Shop All Products",
    heroSubtitle:
      "Discover our latest collections, trending fashion, accessories, and more. Shop with confidence—premium quality guaranteed.",
    heroImage: "",

    promoTitle: "Curated storefront experience",
    promoText:
      "Browse a cleaner, faster and more premium shopping experience with refined filters and structured discovery.",
    defaultSort: "newest",

    emptyStateTitle: "No products found",
    emptyStateSubtitle:
      "Try removing a filter, changing your search, or browsing the full catalog again.",

    trustBadges: [
      { id: "curated", label: "Curated catalog" },
      { id: "secure", label: "Secure checkout" },
      { id: "responsive", label: "Responsive experience" },
    ],

    featuredCollections: [
      {
        id: "latest",
        title: "Latest arrivals",
        description: "Explore newly updated products from the live catalog.",
        href: "/shop?sort=latest",
        image: "",
      },
      {
        id: "in-stock",
        title: "Ready to ship",
        description: "Browse products that are currently available in stock.",
        href: "/shop?inStock=true",
        image: "",
      },
    ],

    categories: [
      { name: "Men", iconKey: "Shirt" },
      { name: "Women", iconKey: "ShoppingBag" },
      { name: "Accessories", iconKey: "Watch" },
      { name: "Jewelry", iconKey: "Gem" },
      { name: "Kids", iconKey: "Baby" },
      { name: "Gifts", iconKey: "Gift" },
    ],

    brands: [],
    priceMax: 5000,
  };
}

function defaultHomeConfig() {
  return {
    hero: {
      eyebrow: "New arrivals",
      title: "Elevate your everyday wardrobe with refined essentials",
      description:
        "Discover premium pieces curated from your live catalog, designed for comfort, confidence, and modern style.",
      image: "",
      primaryCtaLabel: "Shop collection",
      primaryCtaHref: "",
      secondaryCtaLabel: "Explore latest",
      secondaryCtaHref: "/shop?sort=latest",
      stats: [
        { label: "Active products", value: "" },
        { label: "Collections", value: "" },
        { label: "Brands", value: "" },
      ],
    },

    collections: {
      title: "Explore Our Collections",
      subtitle:
        "Curated categories from your live catalog to help customers discover products faster.",
    },

    trending: {
      title: "Trending Now",
      subtitle: "Fresh picks from your most recently updated in-stock catalog.",
      ctaLabel: "View all products",
      ctaHref: "/shop",
      enabled: true,
      hideWhenEmpty: true,
      maxItems: 4,
      minItems: 1,
      excludeDuplicates: true,
      requireInStock: true,
    },

    bestSellers: {
      title: "Best Sellers",
      subtitle: "Top-selling products ranked from completed commerce activity.",
      ctaLabel: "Browse best picks",
      ctaHref: "/shop?sort=latest",
      enabled: true,
      hideWhenEmpty: true,
      maxItems: 8,
      minItems: 1,
      excludeDuplicates: true,
      requireInStock: true,
    },

    flashSale: {
      title: "Flash Sale",
      subtitle: "Live discounted products with real compare-at pricing.",
      ctaLabel: "Shop deals",
      ctaHref: "",
      enabled: true,
      hideWhenEmpty: true,
      maxItems: 4,
      minItems: 1,
      excludeDuplicates: true,
      requireInStock: true,
      requireDiscount: true,
    },

    whyChooseUs: {
      title: "Why Choose Us",
      items: [
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
      title: "What Customers Say",
      items: [
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
      eyebrow: "Seasonal edit",
      title: "Refresh your wardrobe with the latest curated arrivals",
      description:
        "Explore timely essentials and standout pieces crafted to keep your catalog feeling current.",
      image: "",
      ctaLabel: "Shop seasonal picks",
      ctaHref: "/shop?sort=latest",
    },

    shopByPrice: {
      title: "Shop by Price",
      subtitle:
        "Budget-aware shopping paths that help customers discover the right products faster.",
      items: [
        { id: "under-budget", label: "Under Budget", href: "" },
        { id: "premium-range", label: "Premium Range", href: "" },
        { id: "in-stock-deals", label: "In Stock Deals", href: "" },
      ],
    },

    shopByStyle: {
      title: "Shop by Style",
      subtitle:
        "Fast discovery paths based on category and brand-led shopping intent.",
    },

    instagramFeed: {
      title: "Inspired by the Feed",
      subtitle: "Editorial-style product inspiration built from your live catalog.",
    },

    brandStory: {
      eyebrow: "Our story",
      title: "Built for a cleaner, smarter modern shopping experience",
      description:
        "This storefront blends structured catalog data, strong merchandising foundations, and scalable customer journeys to create a more premium digital retail experience.",
      image: "",
      ctaLabel: "Explore the catalog",
      ctaHref: "/shop",
    },

    newsletter: {
      title: "Join our newsletter",
      description:
        "Get product highlights, new arrivals, and curated seasonal picks delivered to your inbox.",
      placeholder: "Enter your email",
      buttonLabel: "Subscribe",
    },
  };
}

/** Enterprise default admin settings */
function defaultAdminSettings() {
  return {
    store: {
      name: "",
      supportEmail: "",
      supportPhone: "",
      address: "",
      currency: "BDT",
      timezone: "Asia/Dhaka",
    },
    branding: {
      logoUrl: "",
      faviconUrl: "",
      primaryColor: "#000000",
      enableDarkMode: false,
    },
    commerce: {
      lowStockThreshold: 5,
      allowBackorders: false,
      allowGuestCheckout: false,
      autoCancelUnpaidMinutes: 30,
    },
    notifications: {
      notifyNewOrder: false,
      notifyLowStock: false,
      emails: [],
    },
    security: {
      require2FAForAdmins: false,
      sessionMaxAgeDays: 30,
      ipAllowlist: "",
    },
    data: {
      auditLogRetentionDays: 90,
    },
    site: {
      maintenanceMode: false,
      maintenanceMessage:
        "We are performing scheduled maintenance. Please try again soon.",
    },
  };
}

function sanitizeString(v, maxLen) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeSpaces(v, maxLen) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function isSafeUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return false;
  if (v.startsWith("/")) return true;

  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(u) {
  const v = String(u || "").trim();
  if (!v) return "";
  const cleaned = v.replace(/\s+/g, "").replace(/\/$/, "");
  return isSafeUrl(cleaned) ? cleaned : "";
}

function normalizeEmail(e) {
  const v = String(e || "").trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  return EMAIL_RE.test(lower) ? lower : "";
}

function normalizeEmails(list) {
  const inArr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();

  for (const raw of inArr) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }

  return out.slice(0, 25);
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const k = Math.round(x);
  return Math.min(max, Math.max(min, k));
}

function toBool(v) {
  return v === true || v === "true" || v === 1 || v === "1" || v === "on";
}

function parseExpectedVersion(req) {
  const hdr = req.headers["if-match"] || req.headers["x-config-version"];
  const bodyV = req.body?.version;

  const pick = (x) => {
    if (x === undefined || x === null) return null;
    const s = String(x).match(/\d+/);
    if (!s) return null;
    const n = Number(s[0]);
    return Number.isFinite(n) ? n : null;
  };

  return pick(hdr) ?? pick(bodyV);
}

function normalizeSimpleStats(stats) {
  const list = Array.isArray(stats) ? stats : [];
  return list
    .map((item) => ({
      label: sanitizeString(item?.label, 40),
      value: sanitizeString(item?.value, 40),
    }))
    .filter((item) => item.label || item.value)
    .slice(0, 6);
}

function normalizeSimpleItems(items, limits = {}) {
  const {
    maxItems = 8,
    titleMax = 80,
    descMax = 240,
    nameMax = 60,
    quoteMax = 240,
  } = limits;

  const list = Array.isArray(items) ? items : [];
  return list
    .map((item, index) => ({
      id: sanitizeString(item?.id, 60) || `item-${index + 1}`,
      title: sanitizeString(item?.title, titleMax),
      description: sanitizeString(item?.description || item?.desc, descMax),
      name: sanitizeString(item?.name, nameMax),
      quote: sanitizeString(item?.quote, quoteMax),
      label: sanitizeString(item?.label, titleMax),
      href: normalizeUrl(item?.href),
      image: normalizeUrl(item?.image),
      type: sanitizeString(item?.type, 30).toLowerCase(),
      rating: clampInt(item?.rating, 1, 5, 5),
      value: sanitizeString(item?.value, 40),
    }))
    .slice(0, maxItems);
}

function normalizeMerchandisingSection(input, base, options = {}) {
  const fallbackMaxItems = Number.isFinite(Number(options.maxItems))
    ? Number(options.maxItems)
    : 4;

  const maxItems = clampInt(
    input?.maxItems,
    1,
    12,
    base.maxItems || fallbackMaxItems
  );

  const minItemsRaw = clampInt(
    input?.minItems,
    0,
    12,
    base.minItems || 1
  );

  const minItems = Math.min(minItemsRaw, maxItems);

  return {
    title: sanitizeString(input?.title, 80) || base.title,
    subtitle: sanitizeString(input?.subtitle, 220) || base.subtitle,
    ctaLabel: sanitizeString(input?.ctaLabel, 40) || base.ctaLabel,
    ctaHref: normalizeUrl(input?.ctaHref) || base.ctaHref,
    enabled: input?.enabled !== false,
    hideWhenEmpty: input?.hideWhenEmpty !== false,
    maxItems,
    minItems,
    excludeDuplicates: input?.excludeDuplicates !== false,
    requireInStock: input?.requireInStock !== false,
    ...(options.includeRequireDiscount
      ? {
          requireDiscount:
            input?.requireDiscount === true ||
            input?.requireDiscount === "true" ||
            input?.requireDiscount === 1 ||
            input?.requireDiscount === "1",
        }
      : {}),
  };
}

function normalizeShopSort(value, fallback = "newest") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const lowered = raw.toLowerCase();
  if (lowered === "price_asc" || lowered === "pricelow") return "priceLow";
  if (lowered === "price_desc" || lowered === "pricehigh") return "priceHigh";
  if (lowered === "latest" || lowered === "newest") return "newest";

  return ALLOWED_SHOP_SORTS.has(raw) ? raw : fallback;
}

function normalizeShopBadges(input, defaults = []) {
  const source = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();

  for (let index = 0; index < source.length; index += 1) {
    const item = source[index];
    const label =
      typeof item === "string"
        ? normalizeSpaces(item, 40)
        : normalizeSpaces(item?.label, 40);

    if (!label) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id:
        sanitizeString(typeof item === "string" ? "" : item?.id, 60) ||
        `badge-${index + 1}`,
      label,
    });
  }

  return out.length ? out.slice(0, 6) : defaults;
}

function normalizeShopCollections(input, defaults = []) {
  const items = normalizeSimpleItems(input, {
    maxItems: 6,
    titleMax: 80,
    descMax: 220,
  });

  const mapped = items
    .map((item, index) => ({
      id: item.id || `collection-${index + 1}`,
      title: item.title || "Collection",
      description: item.description || "",
      href: item.href || "/shop",
      image: item.image || "",
    }))
    .filter((item) => item.title);

  return mapped.length ? mapped : defaults;
}

function isValidObjectIdString(id) {
  return /^[0-9a-fA-F]{24}$/.test(String(id || "").trim());
}

async function logConfigAction(req, payload) {
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

function validateShopPayload(body) {
  const defaults = defaultShopConfig();

  const heroEyebrow = sanitizeString(body?.heroEyebrow, 40);
  const heroTitle = sanitizeString(body?.heroTitle, 90);
  const heroSubtitle = sanitizeString(body?.heroSubtitle, 320);
  const heroImage = normalizeUrl(body?.heroImage);

  const promoTitle = sanitizeString(body?.promoTitle, 80);
  const promoText = sanitizeString(body?.promoText, 220);

  const emptyStateTitle = sanitizeString(body?.emptyStateTitle, 80);
  const emptyStateSubtitle = sanitizeString(body?.emptyStateSubtitle, 220);

  const categoriesIn = Array.isArray(body?.categories) ? body.categories : [];
  const categories = categoriesIn
    .map((c) => {
      const name = normalizeSpaces(c?.name, 40);
      const iconKey = normalizeSpaces(c?.iconKey, 30);
      if (!name) return null;
      if (iconKey && !ALLOWED_ICON_KEYS.has(iconKey)) return null;
      return { name, iconKey: iconKey || "ShoppingBag" };
    })
    .filter(Boolean)
    .slice(0, 40);

  const seen = new Set();
  const categoriesDeduped = [];
  for (const c of categories) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    categoriesDeduped.push(c);
  }

  const brandsIn = Array.isArray(body?.brands) ? body.brands : [];
  const brands = brandsIn
    .map((b) => normalizeSpaces(b, 40))
    .filter(Boolean)
    .slice(0, 80);
  const brandsDeduped = Array.from(new Set(brands.map((b) => b.trim())));

  const priceMaxNum = Number(body?.priceMax);
  const priceMax =
    Number.isFinite(priceMaxNum) && priceMaxNum > 0
      ? Math.round(priceMaxNum)
      : defaults.priceMax;

  const defaultSort = normalizeShopSort(body?.defaultSort, defaults.defaultSort);

  const trustBadges = normalizeShopBadges(body?.trustBadges, defaults.trustBadges);
  const featuredCollections = normalizeShopCollections(
    body?.featuredCollections,
    defaults.featuredCollections
  );

  return {
    heroEyebrow: heroEyebrow || defaults.heroEyebrow,
    heroTitle: heroTitle || defaults.heroTitle,
    heroSubtitle: heroSubtitle || defaults.heroSubtitle,
    heroImage: heroImage || "",

    promoTitle: promoTitle || defaults.promoTitle,
    promoText: promoText || defaults.promoText,
    defaultSort,

    emptyStateTitle: emptyStateTitle || defaults.emptyStateTitle,
    emptyStateSubtitle: emptyStateSubtitle || defaults.emptyStateSubtitle,

    trustBadges,
    featuredCollections,

    categories: categoriesDeduped.length ? categoriesDeduped : defaults.categories,
    brands: brandsDeduped,
    priceMax,
  };
}

function validateHomePayload(body) {
  const base = defaultHomeConfig();

  const heroIn = body?.hero || {};
  const collectionsIn = body?.collections || {};
  const trendingIn = body?.trending || {};
  const bestSellersIn = body?.bestSellers || {};
  const flashSaleIn = body?.flashSale || {};
  const whyChooseUsIn = body?.whyChooseUs || {};
  const testimonialsIn = body?.testimonials || {};
  const seasonalBannerIn = body?.seasonalBanner || {};
  const shopByPriceIn = body?.shopByPrice || {};
  const shopByStyleIn = body?.shopByStyle || {};
  const instagramFeedIn = body?.instagramFeed || {};
  const brandStoryIn = body?.brandStory || {};
  const newsletterIn = body?.newsletter || {};

  return {
    hero: {
      eyebrow: sanitizeString(heroIn.eyebrow, 40) || base.hero.eyebrow,
      title: sanitizeString(heroIn.title, 140) || base.hero.title,
      description:
        sanitizeString(heroIn.description, 320) || base.hero.description,
      image: normalizeUrl(heroIn.image),
      primaryCtaLabel:
        sanitizeString(heroIn.primaryCtaLabel, 40) || base.hero.primaryCtaLabel,
      primaryCtaHref: normalizeUrl(heroIn.primaryCtaHref),
      secondaryCtaLabel:
        sanitizeString(heroIn.secondaryCtaLabel, 40) ||
        base.hero.secondaryCtaLabel,
      secondaryCtaHref:
        normalizeUrl(heroIn.secondaryCtaHref) || base.hero.secondaryCtaHref,
      stats:
        normalizeSimpleStats(heroIn.stats).length > 0
          ? normalizeSimpleStats(heroIn.stats)
          : base.hero.stats,
    },

    collections: {
      title: sanitizeString(collectionsIn.title, 80) || base.collections.title,
      subtitle:
        sanitizeString(collectionsIn.subtitle, 220) || base.collections.subtitle,
    },

    trending: normalizeMerchandisingSection(trendingIn, base.trending, {
      maxItems: 4,
    }),

    bestSellers: normalizeMerchandisingSection(bestSellersIn, base.bestSellers, {
      maxItems: 8,
    }),

    flashSale: normalizeMerchandisingSection(flashSaleIn, base.flashSale, {
      maxItems: 4,
      includeRequireDiscount: true,
    }),

    whyChooseUs: {
      title: sanitizeString(whyChooseUsIn.title, 80) || base.whyChooseUs.title,
      items: normalizeSimpleItems(whyChooseUsIn.items, {
        maxItems: 6,
        titleMax: 80,
        descMax: 220,
      }).map((item) => ({
        id: item.id,
        title: item.title || "Feature",
        description: item.description || "",
      })),
    },

    testimonials: {
      title:
        sanitizeString(testimonialsIn.title, 80) || base.testimonials.title,
      items: normalizeSimpleItems(testimonialsIn.items, {
        maxItems: 10,
        nameMax: 60,
        quoteMax: 220,
      }).map((item) => ({
        id: item.id,
        name: item.name || "Customer",
        quote: item.quote || "",
        rating: item.rating || 5,
      })),
    },

    seasonalBanner: {
      eyebrow:
        sanitizeString(seasonalBannerIn.eyebrow, 40) ||
        base.seasonalBanner.eyebrow,
      title:
        sanitizeString(seasonalBannerIn.title, 120) ||
        base.seasonalBanner.title,
      description:
        sanitizeString(seasonalBannerIn.description, 260) ||
        base.seasonalBanner.description,
      image: normalizeUrl(seasonalBannerIn.image),
      ctaLabel:
        sanitizeString(seasonalBannerIn.ctaLabel, 40) ||
        base.seasonalBanner.ctaLabel,
      ctaHref:
        normalizeUrl(seasonalBannerIn.ctaHref) || base.seasonalBanner.ctaHref,
    },

    shopByPrice: {
      title: sanitizeString(shopByPriceIn.title, 80) || base.shopByPrice.title,
      subtitle:
        sanitizeString(shopByPriceIn.subtitle, 220) || base.shopByPrice.subtitle,
      items: normalizeSimpleItems(shopByPriceIn.items, {
        maxItems: 6,
        titleMax: 80,
      })
        .map((item) => ({
          id: item.id,
          label: item.label || "Price range",
          href: item.href,
        }))
        .filter((item) => item.label),
    },

    shopByStyle: {
      title: sanitizeString(shopByStyleIn.title, 80) || base.shopByStyle.title,
      subtitle:
        sanitizeString(shopByStyleIn.subtitle, 220) || base.shopByStyle.subtitle,
    },

    instagramFeed: {
      title:
        sanitizeString(instagramFeedIn.title, 80) || base.instagramFeed.title,
      subtitle:
        sanitizeString(instagramFeedIn.subtitle, 220) ||
        base.instagramFeed.subtitle,
    },

    brandStory: {
      eyebrow:
        sanitizeString(brandStoryIn.eyebrow, 40) || base.brandStory.eyebrow,
      title: sanitizeString(brandStoryIn.title, 140) || base.brandStory.title,
      description:
        sanitizeString(brandStoryIn.description, 320) ||
        base.brandStory.description,
      image: normalizeUrl(brandStoryIn.image),
      ctaLabel:
        sanitizeString(brandStoryIn.ctaLabel, 40) || base.brandStory.ctaLabel,
      ctaHref: normalizeUrl(brandStoryIn.ctaHref) || base.brandStory.ctaHref,
    },

    newsletter: {
      title: sanitizeString(newsletterIn.title, 80) || base.newsletter.title,
      description:
        sanitizeString(newsletterIn.description, 220) ||
        base.newsletter.description,
      placeholder:
        sanitizeString(newsletterIn.placeholder, 80) ||
        base.newsletter.placeholder,
      buttonLabel:
        sanitizeString(newsletterIn.buttonLabel, 40) ||
        base.newsletter.buttonLabel,
    },
  };
}

function validateAdminSettingsPayload(body) {
  const base = defaultAdminSettings();

  const storeIn = body?.store || {};
  const brandingIn = body?.branding || {};
  const commerceIn = body?.commerce || {};
  const notificationsIn = body?.notifications || {};
  const securityIn = body?.security || {};
  const dataIn = body?.data || {};
  const siteIn = body?.site || {};

  const store = {
    name: normalizeSpaces(storeIn.name, 80),
    supportEmail: normalizeEmail(storeIn.supportEmail).slice(0, 120),
    supportPhone: sanitizeString(storeIn.supportPhone, 40),
    address: normalizeSpaces(storeIn.address, 200),
    currency:
      String(storeIn.currency || base.store.currency)
        .trim()
        .toUpperCase()
        .slice(0, 8) || base.store.currency,
    timezone:
      String(storeIn.timezone || base.store.timezone).trim().slice(0, 60) ||
      base.store.timezone,
  };

  const color =
    sanitizeString(brandingIn.primaryColor || base.branding.primaryColor, 30) ||
    base.branding.primaryColor;

  const branding = {
    logoUrl: normalizeUrl(brandingIn.logoUrl).slice(0, 500),
    faviconUrl: normalizeUrl(brandingIn.faviconUrl).slice(0, 500),
    primaryColor: HEX_COLOR_RE.test(color) ? color : base.branding.primaryColor,
    enableDarkMode: toBool(brandingIn.enableDarkMode),
  };

  const commerce = {
    lowStockThreshold: clampInt(
      commerceIn.lowStockThreshold,
      0,
      9999,
      base.commerce.lowStockThreshold
    ),
    allowBackorders: toBool(commerceIn.allowBackorders),
    allowGuestCheckout: toBool(commerceIn.allowGuestCheckout),
    autoCancelUnpaidMinutes: clampInt(
      commerceIn.autoCancelUnpaidMinutes,
      0,
      7 * 24 * 60,
      base.commerce.autoCancelUnpaidMinutes
    ),
  };

  const notifications = {
    notifyNewOrder: toBool(notificationsIn.notifyNewOrder),
    notifyLowStock: toBool(notificationsIn.notifyLowStock),
    emails: normalizeEmails(notificationsIn.emails),
  };

  const security = {
    require2FAForAdmins: toBool(securityIn.require2FAForAdmins),
    sessionMaxAgeDays: clampInt(
      securityIn.sessionMaxAgeDays,
      1,
      365,
      base.security.sessionMaxAgeDays
    ),
    ipAllowlist: normalizeSpaces(securityIn.ipAllowlist, 400),
  };

  const data = {
    auditLogRetentionDays: clampInt(
      dataIn.auditLogRetentionDays,
      7,
      3650,
      base.data.auditLogRetentionDays
    ),
  };

  const maintenanceMessage = sanitizeString(siteIn.maintenanceMessage, 220);

  const site = {
    maintenanceMode: toBool(siteIn.maintenanceMode),
    maintenanceMessage: maintenanceMessage || base.site.maintenanceMessage,
  };

  return { store, branding, commerce, notifications, security, data, site };
}

async function getOrCreate(key, defaults) {
  const doc = await PageConfig.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, data: defaults, version: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
}

async function updateConfigWithVersioning(req, key, data, action) {
  const expectedVersion = parseExpectedVersion(req);
  const existing = await PageConfig.findOne({ key }).lean();

  const update = {
    $set: { data, updatedBy: req.user?.sub || null },
    $inc: { version: 1 },
  };

  const filter = { key };
  if (expectedVersion != null) filter.version = expectedVersion;

  const doc = await PageConfig.findOneAndUpdate(filter, update, {
    new: true,
    upsert: expectedVersion == null,
    setDefaultsOnInsert: true,
  });

  if (!doc && expectedVersion != null) {
    throw new ApiError(409, "Version conflict. Please reload and try again.");
  }
  if (!doc) {
    throw new ApiError(500, `Failed to update ${key} config`);
  }

  await logConfigAction(req, {
    action,
    entity: "page_config",
    entityId: doc?._id,
    before: existing
      ? {
          key: existing.key,
          version: existing.version,
          updatedAt: existing.updatedAt,
          data: existing.data,
        }
      : null,
    after: {
      key: doc.key,
      version: doc.version,
      updatedAt: doc.updatedAt,
      data: doc.data,
    },
    meta: {
      configKey: key,
      expectedVersion,
      savedVersion: doc.version,
    },
  });

  return doc;
}

/** ==========================
 * SHOP CONFIG
 * ========================== */

exports.getShopPublic = async (req, res, next) => {
  try {
    const doc = await getOrCreate("shop", defaultShopConfig());
    const safeData = validateShopPayload(doc?.data || {});

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      key: doc.key,
      data: safeData,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

exports.upsertShop = async (req, res, next) => {
  try {
    const data = validateShopPayload(req.body || {});
    const doc = await updateConfigWithVersioning(
      req,
      "shop",
      data,
      "pageConfig.shop.update"
    );

    res.json({
      key: doc.key,
      data: doc.data,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

/** ==========================
 * HOME CONFIG
 * ========================== */

exports.getHomePublic = async (req, res, next) => {
  try {
    const doc = await getOrCreate("home", defaultHomeConfig());
    const safeData = validateHomePayload(doc?.data || {});

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      key: doc.key,
      data: safeData,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

exports.upsertHome = async (req, res, next) => {
  try {
    const data = validateHomePayload(req.body || {});
    const doc = await updateConfigWithVersioning(
      req,
      "home",
      data,
      "pageConfig.home.update"
    );

    res.json({
      key: doc.key,
      data: doc.data,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

/** ============================================================
 * ADMIN SETTINGS
 * ============================================================ */

exports.getAdminSettingsPublic = async (req, res, next) => {
  try {
    const doc = await getOrCreate("admin_settings", defaultAdminSettings());

    const safe = {
      commerce: {
        allowBackorders: Boolean(doc?.data?.commerce?.allowBackorders),
        allowGuestCheckout: Boolean(doc?.data?.commerce?.allowGuestCheckout),
      },
      site: {
        maintenanceMode: Boolean(doc?.data?.site?.maintenanceMode),
        maintenanceMessage:
          sanitizeString(doc?.data?.site?.maintenanceMessage, 220) ||
          defaultAdminSettings().site.maintenanceMessage,
      },
    };

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      key: doc.key,
      data: safe,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

exports.getAdminSettings = async (req, res, next) => {
  try {
    const doc = await getOrCreate("admin_settings", defaultAdminSettings());
    res.set("Cache-Control", "no-store");
    res.json({
      key: doc.key,
      data: doc.data || defaultAdminSettings(),
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

exports.upsertAdminSettings = async (req, res, next) => {
  try {
    const data = validateAdminSettingsPayload(req.body || {});
    const doc = await updateConfigWithVersioning(
      req,
      "admin_settings",
      data,
      "pageConfig.adminSettings.update"
    );

    res.set("Cache-Control", "no-store");
    res.json({
      key: doc.key,
      data: doc.data,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};