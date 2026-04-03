const PageConfig = require("../models/PageConfig");
const AdminAuditLog = require("../models/AdminAuditLog");
const ApiError = require("../utils/apiError");

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
      {
        id: "men",
        name: "Men",
        slug: "men",
        iconKey: "Shirt",
        image: "",
        isActive: true,
        featured: true,
        sortOrder: 1,
      },
      {
        id: "women",
        name: "Women",
        slug: "women",
        iconKey: "ShoppingBag",
        image: "",
        isActive: true,
        featured: true,
        sortOrder: 2,
      },
      {
        id: "accessories",
        name: "Accessories",
        slug: "accessories",
        iconKey: "Watch",
        image: "",
        isActive: true,
        featured: true,
        sortOrder: 3,
      },
      {
        id: "jewelry",
        name: "Jewelry",
        slug: "jewelry",
        iconKey: "Gem",
        image: "",
        isActive: true,
        featured: false,
        sortOrder: 4,
      },
      {
        id: "kids",
        name: "Kids",
        slug: "kids",
        iconKey: "Baby",
        image: "",
        isActive: true,
        featured: false,
        sortOrder: 5,
      },
      {
        id: "gifts",
        name: "Gifts",
        slug: "gifts",
        iconKey: "Gift",
        image: "",
        isActive: true,
        featured: false,
        sortOrder: 6,
      },
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
      featureBadge: "Featured selection",
      featureText:
        "A premium first impression built around strong presentation and cleaner discovery.",
      highlights: ["Fresh arrivals", "Thoughtful edits", "Reliable delivery"],
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
      secondaryCtaLabel: "Explore latest",
      secondaryCtaHref: "/shop?sort=latest",
      featureBadge: "Seasonal spotlight",
      featureText:
        "A campaign-led section that keeps the homepage feeling current and elevated.",
      highlights: ["Limited edit", "Premium textures", "Modern silhouettes"],
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
      secondaryCtaLabel: "View latest arrivals",
      secondaryCtaHref: "/shop?sort=latest",
      featureBadge: "Brand story",
      featureText:
        "A stronger brand section helps the storefront feel more trustworthy, premium, and memorable.",
      highlights: ["Curated catalog", "Cleaner discovery", "Premium storefront"],
      stats: [
        { label: "Curated catalog", value: "Live" },
        { label: "Storefront", value: "Premium" },
        { label: "Experience", value: "Responsive" },
      ],
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

function defaultContactConfig() {
  return {
    hero: {
      eyebrow: "Contact us",
      title: "Need help? We are here to make things easier.",
      description:
        "Whether you have a question about an order, need support, or want to reach the right team, you can contact Smart Shop in the way that works best for you.",
      image:
        "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80",
      primaryLabel: "Email support",
      primaryHref: "mailto:support@smartshop.com",
      secondaryLabel: "Call us",
      secondaryHref: "tel:+8801234567890",
    },

    infoCards: {
      title: "Quick ways to reach us",
      subtitle:
        "Use any of these contact options if you want a faster way to get in touch.",
      items: [
        {
          title: "Email us",
          text: "support@smartshop.com",
          icon: "mail",
        },
        {
          title: "Call support",
          text: "+880 1234-567890",
          icon: "phone",
        },
        {
          title: "Office location",
          text: "Dhaka, Bangladesh",
          icon: "mapPin",
        },
        {
          title: "Support hours",
          text: "Sat–Thu: 9:00 AM – 10:00 PM",
          icon: "clock",
        },
      ],
    },

    supportCategories: {
      title: "Choose the right team",
      subtitle:
        "Reaching the right team first usually means a faster and more helpful reply.",
      items: [
        {
          title: "Customer support",
          description:
            "For help with orders, refunds, payments, returns, or delivery updates.",
          label: "Contact support",
          href: "mailto:support@smartshop.com",
        },
        {
          title: "Business inquiries",
          description:
            "For partnerships, collaborations, bulk purchases, or other business requests.",
          label: "Contact business team",
          href: "mailto:business@smartshop.com",
        },
        {
          title: "Media and press",
          description:
            "For interviews, brand-related questions, or press communication.",
          label: "Contact press team",
          href: "mailto:press@smartshop.com",
        },
      ],
      resourceButtonLabel: "View help resources",
      resourceButtonHref: "/faq",
    },

    faq: {
      title: "Frequently asked questions",
      subtitle: "A few common questions customers usually ask before reaching out.",
      items: [
        {
          q: "How can I track my order?",
          a: "Once your order is shipped, we send a tracking update by email or SMS. You can also check your order status from your account.",
        },
        {
          q: "What is your return policy?",
          a: "Unused items in their original condition can usually be returned within 7 days. Refund timing may vary depending on the payment method.",
        },
        {
          q: "How do I contact customer support?",
          a: "You can email us at support@smartshop.com or call +880 1234-567890 during support hours.",
        },
        {
          q: "Do you offer international shipping?",
          a: "Yes, international shipping is available in selected cases. Delivery time depends on the destination and shipping option.",
        },
        {
          q: "Can I modify or cancel my order?",
          a: "If your order has not moved into processing yet, our team may still be able to help. Contact support as soon as possible.",
        },
      ],
    },

    location: {
      title: "Visit our office",
      subtitle:
        "If you need in-person assistance or want to reach the team directly, here is our office information.",
      officeName: "Smart Shop Office",
      address: "12 Gulshan Avenue, Dhaka 1212, Bangladesh",
      officeHours: "Saturday to Thursday, 10:00 AM to 6:00 PM",
      mapEmbedUrl:
        "https://www.google.com/maps?q=Gulshan%20Avenue%20Dhaka&z=14&output=embed",
    },

    finalCta: {
      eyebrow: "Need more help?",
      title: "We are ready to help you with the next step.",
      description:
        "Reach out if you still need support, have a question about your order, or want help from the team directly.",
      primaryLabel: "Live chat support",
      primaryHref: "",
      secondaryLabel: "Email us",
      secondaryHref: "mailto:support@smartshop.com",
    },

    social: {
      title: "Connect with us",
      subtitle: "Follow Smart Shop for updates, new arrivals, and brand news.",
      items: [
        { label: "Facebook", href: "https://facebook.com" },
        { label: "Instagram", href: "https://instagram.com" },
        { label: "YouTube", href: "https://youtube.com" },
        { label: "LinkedIn", href: "https://linkedin.com" },
        { label: "WhatsApp", href: "https://wa.me/+8801234567890" },
      ],
    },
  };
}

function defaultCollectionsConfig() {
  return {
    hero: {
      eyebrow: "Browse collections",
      title: "Find your next pick by shopping the way people actually browse.",
      description:
        "Explore curated collections, jump into the categories that matter most, and discover what fits your style without extra steps.",
      primaryCtaLabel: "View all products",
      primaryCtaHref: "/shop",
      secondaryCtaLabel: "Shop featured",
      secondaryCtaHref: "/shop",
      featuredImage: "",
      featuredTag: "Featured collection",
      featuredBadge: "Popular now",
      statItems: [
        {
          id: "collections",
          label: "Collections",
          value: "0",
          hint: "Easy ways to browse",
        },
        {
          id: "products",
          label: "Products",
          value: "0",
          hint: "Across active categories",
        },
        {
          id: "experience",
          label: "Experience",
          value: "Mobile first",
          hint: "Clean, quick and responsive",
        },
      ],
    },

    trustHighlights: [
      {
        id: "secure-checkout",
        title: "Secure checkout",
        description: "A smooth and dependable checkout experience from cart to order.",
        iconKey: "ShieldCheck",
      },
      {
        id: "fast-delivery",
        title: "Fast delivery",
        description: "Quick handling and a cleaner fulfillment flow for everyday orders.",
        iconKey: "Truck",
      },
      {
        id: "easy-returns",
        title: "Easy returns",
        description: "Simple support when a customer needs help after purchase.",
        iconKey: "RefreshCcw",
      },
      {
        id: "easy-browsing",
        title: "Easy browsing",
        description: "A layout designed to help shoppers reach the right products faster.",
        iconKey: "CheckCircle2",
      },
    ],

    filterPanel: {
      eyebrow: "Filter collections",
      title: "Search by category or use the quick filters below.",
      searchPlaceholder: "Search collections...",
      emptyTitle: "No collections found",
      emptyDescription:
        "Try a different keyword or clear the filters to see everything again.",
      resetLabel: "Reset filters",
      resultLabel: "Showing",
    },

    intro: {
      eyebrow: "Collections",
      title: "Browse by category",
      description:
        "Pick a collection and jump straight into the products that fit what you want to shop.",
    },

    collectionCards: [],

    whySection: {
      eyebrow: "Why shop this way",
      title: "A simpler way to explore the store",
      items: [
        {
          id: "faster-discovery",
          text: "Find categories faster without scrolling through everything.",
        },
        {
          id: "cleaner-layout",
          text: "A cleaner layout that feels easier to read on any screen.",
        },
        {
          id: "mobile-friendly",
          text: "Better mobile browsing with clearer tap targets and spacing.",
        },
        {
          id: "quick-filters",
          text: "Quick filters that help narrow things down right away.",
        },
      ],
    },

    finalCta: {
      eyebrow: "Start shopping",
      title: "Ready to explore more?",
      description:
        "Head over to the shop page to browse all products, compare categories, and keep shopping without extra clicks.",
      primaryLabel: "Go to shop",
      primaryHref: "/shop",
      secondaryLabel: "Contact us",
      secondaryHref: "/contact",
      statItems: [
        {
          id: "responsive",
          label: "Easy browsing",
          value: "Responsive",
        },
        {
          id: "clean-ui",
          label: "Clear layout",
          value: "Clean UI",
        },
        {
          id: "mobile",
          label: "Works best on",
          value: "Mobile",
        },
      ],
    },
  };
}

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
  if (v.startsWith("mailto:")) return true;
  if (v.startsWith("tel:")) return true;

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
      id: sanitizeString(item?.id, 60),
      label: sanitizeString(item?.label, 40),
      value: sanitizeString(item?.value, 40),
      hint: sanitizeString(item?.hint, 80),
    }))
    .filter((item) => item.label || item.value || item.hint)
    .slice(0, 6);
}

function normalizeSimpleItems(items, limits = {}) {
  const {
    maxItems = 8,
    titleMax = 80,
    descMax = 240,
    nameMax = 60,
    quoteMax = 240,
    textMax = 220,
    hintMax = 80,
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
      text: sanitizeString(item?.text, textMax),
      hint: sanitizeString(item?.hint, hintMax),
      eyebrow: sanitizeString(item?.eyebrow, 40),
      iconKey: sanitizeString(item?.iconKey, 40),
      badge: sanitizeString(item?.badge, 40),
      tag: sanitizeString(item?.tag, 40),
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

  const minItemsRaw = clampInt(input?.minItems, 0, 12, base.minItems || 1);
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

function normalizeCategoryItem(raw, index = 0) {
  const name = normalizeSpaces(raw?.name, 40);
  if (!name) return null;

  const iconKey = normalizeSpaces(raw?.iconKey, 30);
  const safeIconKey = ALLOWED_ICON_KEYS.has(iconKey) ? iconKey : "ShoppingBag";

  const slug = sanitizeString(raw?.slug, 60) || slugify(name);
  const id = sanitizeString(raw?.id, 60) || slug || `category-${index + 1}`;

  return {
    id,
    name,
    slug: slug || slugify(name) || `category-${index + 1}`,
    iconKey: safeIconKey,
    image: normalizeUrl(raw?.image),
    isActive: raw?.isActive !== false,
    featured:
      raw?.featured === true ||
      raw?.featured === "true" ||
      raw?.featured === 1 ||
      raw?.featured === "1",
    sortOrder: clampInt(raw?.sortOrder, 0, 999, index + 1),
  };
}

function normalizeShopCategories(input, defaults = []) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seenNames = new Set();
  const seenIds = new Set();

  for (let i = 0; i < list.length; i += 1) {
    const item = normalizeCategoryItem(list[i], i);
    if (!item) continue;

    const nameKey = item.name.toLowerCase();
    const idKey = item.id.toLowerCase();
    if (seenNames.has(nameKey) || seenIds.has(idKey)) continue;

    seenNames.add(nameKey);
    seenIds.add(idKey);
    out.push(item);
  }

  const finalList = out.length ? out : defaults;
  return finalList
    .slice(0, 40)
    .sort((a, b) => {
      const byOrder = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      if (byOrder !== 0) return byOrder;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function normalizeContactInfoCards(items, defaults = []) {
  const source = Array.isArray(items) ? items : [];
  const allowedIcons = new Set(["mail", "phone", "mapPin", "clock"]);
  const normalized = source
    .map((item, index) => {
      const title = sanitizeString(item?.title, 60);
      const text = sanitizeString(item?.text, 140);
      const iconRaw = sanitizeString(item?.icon, 30);
      const icon = allowedIcons.has(iconRaw) ? iconRaw : "mail";

      return {
        title: title || `Card ${index + 1}`,
        text,
        icon,
      };
    })
    .filter((item) => item.title || item.text)
    .slice(0, 4);

  return normalized.length ? normalized : defaults;
}

function normalizeContactSupportCategories(items, defaults = []) {
  const source = Array.isArray(items) ? items : [];
  const normalized = source
    .map((item, index) => ({
      title: sanitizeString(item?.title, 80) || `Category ${index + 1}`,
      description: sanitizeString(item?.description, 240),
      label: sanitizeString(item?.label, 50) || "Open",
      href: normalizeUrl(item?.href),
    }))
    .filter((item) => item.title || item.description || item.label || item.href)
    .slice(0, 3);

  return normalized.length ? normalized : defaults;
}

function normalizeContactFaqItems(items, defaults = []) {
  const source = Array.isArray(items) ? items : [];
  const normalized = source
    .map((item) => ({
      q: sanitizeString(item?.q, 180),
      a: sanitizeString(item?.a, 420),
    }))
    .filter((item) => item.q || item.a)
    .slice(0, 8);

  return normalized.length ? normalized : defaults;
}

function normalizeContactSocialItems(items, defaults = []) {
  const source = Array.isArray(items) ? items : [];
  const normalized = source
    .map((item, index) => ({
      label: sanitizeString(item?.label, 50) || `Social ${index + 1}`,
      href: normalizeUrl(item?.href),
    }))
    .filter((item) => item.label || item.href)
    .slice(0, 6);

  return normalized.length ? normalized : defaults;
}

function normalizeCollectionsHighlightItem(item, index = 0) {
  const allowedIcons = new Set([
    "ShieldCheck",
    "Truck",
    "RefreshCcw",
    "CheckCircle2",
  ]);

  const iconKey = sanitizeString(item?.iconKey, 40);
  return {
    id: sanitizeString(item?.id, 60) || `highlight-${index + 1}`,
    title: sanitizeString(item?.title, 60) || `Highlight ${index + 1}`,
    description: sanitizeString(item?.description, 180),
    iconKey: allowedIcons.has(iconKey) ? iconKey : "ShieldCheck",
  };
}

function normalizeCollectionsCard(item, index = 0) {
  const safeTitle = sanitizeString(item?.title, 80);
  const safeSlug =
    sanitizeString(item?.slug, 60) ||
    slugify(item?.title || `collection-${index + 1}`);

  const safeHighlights = Array.isArray(item?.highlights)
    ? item.highlights
        .map((entry) => sanitizeString(entry, 40))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    id: sanitizeString(item?.id, 60) || safeSlug || `collection-${index + 1}`,
    title: safeTitle || `Collection ${index + 1}`,
    slug: safeSlug || `collection-${index + 1}`,
    tag: sanitizeString(item?.tag, 40) || "Collection",
    badge: sanitizeString(item?.badge, 40),
    description: sanitizeString(item?.description, 220),
    image: normalizeUrl(item?.image),
    href:
      normalizeUrl(item?.href) ||
      `/shop?category=${encodeURIComponent(safeTitle || "")}`,
    iconKey: ALLOWED_ICON_KEYS.has(sanitizeString(item?.iconKey, 30))
      ? sanitizeString(item?.iconKey, 30)
      : "ShoppingBag",
    count: clampInt(item?.count, 0, 999999, 0),
    isActive: item?.isActive !== false,
    featured:
      item?.featured === true ||
      item?.featured === "true" ||
      item?.featured === 1 ||
      item?.featured === "1",
    sortOrder: clampInt(item?.sortOrder, 0, 999, index + 1),
    highlights: safeHighlights.length
      ? safeHighlights
      : ["Live catalog", "Updated", "Category"],
  };
}

function normalizeCollectionsCards(input, defaults = []) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seenIds = new Set();

  for (let i = 0; i < list.length; i += 1) {
    const item = normalizeCollectionsCard(list[i], i);
    const idKey = String(item.id || "").toLowerCase();
    if (!item.title || seenIds.has(idKey)) continue;
    seenIds.add(idKey);
    out.push(item);
  }

  const finalList = out.length ? out : defaults;
  return finalList
    .slice(0, 24)
    .sort((a, b) => {
      const byOrder = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
      if (byOrder !== 0) return byOrder;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
}

function normalizeSimpleStringList(items = [], maxItems = 6, maxLen = 40) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const value = sanitizeString(typeof raw === "string" ? raw : raw?.label, maxLen);
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out.slice(0, maxItems);
}

function validateContactPayload(body) {
  const base = defaultContactConfig();

  const heroIn = body?.hero || {};
  const infoCardsIn = body?.infoCards || {};
  const supportCategoriesIn = body?.supportCategories || {};
  const faqIn = body?.faq || {};
  const locationIn = body?.location || {};
  const finalCtaIn = body?.finalCta || {};
  const socialIn = body?.social || {};

  return {
    hero: {
      eyebrow: sanitizeString(heroIn.eyebrow, 40) || base.hero.eyebrow,
      title: sanitizeString(heroIn.title, 140) || base.hero.title,
      description:
        sanitizeString(heroIn.description, 320) || base.hero.description,
      image: normalizeUrl(heroIn.image) || base.hero.image,
      primaryLabel:
        sanitizeString(heroIn.primaryLabel, 50) || base.hero.primaryLabel,
      primaryHref: normalizeUrl(heroIn.primaryHref) || base.hero.primaryHref,
      secondaryLabel:
        sanitizeString(heroIn.secondaryLabel, 50) || base.hero.secondaryLabel,
      secondaryHref:
        normalizeUrl(heroIn.secondaryHref) || base.hero.secondaryHref,
    },

    infoCards: {
      title: sanitizeString(infoCardsIn.title, 80) || base.infoCards.title,
      subtitle:
        sanitizeString(infoCardsIn.subtitle, 220) || base.infoCards.subtitle,
      items: normalizeContactInfoCards(infoCardsIn.items, base.infoCards.items),
    },

    supportCategories: {
      title:
        sanitizeString(supportCategoriesIn.title, 80) ||
        base.supportCategories.title,
      subtitle:
        sanitizeString(supportCategoriesIn.subtitle, 220) ||
        base.supportCategories.subtitle,
      items: normalizeContactSupportCategories(
        supportCategoriesIn.items,
        base.supportCategories.items
      ),
      resourceButtonLabel:
        sanitizeString(supportCategoriesIn.resourceButtonLabel, 50) ||
        base.supportCategories.resourceButtonLabel,
      resourceButtonHref:
        normalizeUrl(supportCategoriesIn.resourceButtonHref) ||
        base.supportCategories.resourceButtonHref,
    },

    faq: {
      title: sanitizeString(faqIn.title, 80) || base.faq.title,
      subtitle: sanitizeString(faqIn.subtitle, 220) || base.faq.subtitle,
      items: normalizeContactFaqItems(faqIn.items, base.faq.items),
    },

    location: {
      title: sanitizeString(locationIn.title, 80) || base.location.title,
      subtitle:
        sanitizeString(locationIn.subtitle, 220) || base.location.subtitle,
      officeName:
        sanitizeString(locationIn.officeName, 80) || base.location.officeName,
      address: sanitizeString(locationIn.address, 240) || base.location.address,
      officeHours:
        sanitizeString(locationIn.officeHours, 120) || base.location.officeHours,
      mapEmbedUrl:
        normalizeUrl(locationIn.mapEmbedUrl) || base.location.mapEmbedUrl,
    },

    finalCta: {
      eyebrow: sanitizeString(finalCtaIn.eyebrow, 40) || base.finalCta.eyebrow,
      title: sanitizeString(finalCtaIn.title, 140) || base.finalCta.title,
      description:
        sanitizeString(finalCtaIn.description, 280) || base.finalCta.description,
      primaryLabel:
        sanitizeString(finalCtaIn.primaryLabel, 50) || base.finalCta.primaryLabel,
      primaryHref:
        normalizeUrl(finalCtaIn.primaryHref) || base.finalCta.primaryHref,
      secondaryLabel:
        sanitizeString(finalCtaIn.secondaryLabel, 50) ||
        base.finalCta.secondaryLabel,
      secondaryHref:
        normalizeUrl(finalCtaIn.secondaryHref) || base.finalCta.secondaryHref,
    },

    social: {
      title: sanitizeString(socialIn.title, 80) || base.social.title,
      subtitle: sanitizeString(socialIn.subtitle, 220) || base.social.subtitle,
      items: normalizeContactSocialItems(socialIn.items, base.social.items),
    },
  };
}

function validateCollectionsPayload(body) {
  const base = defaultCollectionsConfig();

  const heroIn = body?.hero || {};
  const filterPanelIn = body?.filterPanel || {};
  const introIn = body?.intro || {};
  const whySectionIn = body?.whySection || {};
  const finalCtaIn = body?.finalCta || {};

  const heroStats =
    normalizeSimpleStats(heroIn.statItems).length > 0
      ? normalizeSimpleStats(heroIn.statItems)
      : base.hero.statItems;

  const trustHighlightsSource = Array.isArray(body?.trustHighlights)
    ? body.trustHighlights
    : [];

  const trustHighlights = trustHighlightsSource
    .map((item, index) => normalizeCollectionsHighlightItem(item, index))
    .slice(0, 4);

  const safeTrustHighlights = trustHighlights.length
    ? trustHighlights
    : base.trustHighlights;

  const cards = normalizeCollectionsCards(
    body?.collectionCards,
    base.collectionCards
  );

  const whyItems = normalizeSimpleItems(whySectionIn.items, {
    maxItems: 6,
    textMax: 220,
  })
    .map((item, index) => ({
      id: item.id || `why-${index + 1}`,
      text: item.text || item.description || "",
    }))
    .filter((item) => item.text);

  const finalStats =
    normalizeSimpleStats(finalCtaIn.statItems).length > 0
      ? normalizeSimpleStats(finalCtaIn.statItems)
      : base.finalCta.statItems;

  return {
    hero: {
      eyebrow: sanitizeString(heroIn.eyebrow, 40) || base.hero.eyebrow,
      title: sanitizeString(heroIn.title, 140) || base.hero.title,
      description:
        sanitizeString(heroIn.description, 320) || base.hero.description,
      primaryCtaLabel:
        sanitizeString(heroIn.primaryCtaLabel, 50) || base.hero.primaryCtaLabel,
      primaryCtaHref:
        normalizeUrl(heroIn.primaryCtaHref) || base.hero.primaryCtaHref,
      secondaryCtaLabel:
        sanitizeString(heroIn.secondaryCtaLabel, 50) ||
        base.hero.secondaryCtaLabel,
      secondaryCtaHref:
        normalizeUrl(heroIn.secondaryCtaHref) || base.hero.secondaryCtaHref,
      featuredImage: normalizeUrl(heroIn.featuredImage),
      featuredTag: sanitizeString(heroIn.featuredTag, 40) || base.hero.featuredTag,
      featuredBadge:
        sanitizeString(heroIn.featuredBadge, 40) || base.hero.featuredBadge,
      statItems: heroStats,
    },

    trustHighlights: safeTrustHighlights,

    filterPanel: {
      eyebrow:
        sanitizeString(filterPanelIn.eyebrow, 40) || base.filterPanel.eyebrow,
      title: sanitizeString(filterPanelIn.title, 140) || base.filterPanel.title,
      searchPlaceholder:
        sanitizeString(filterPanelIn.searchPlaceholder, 80) ||
        base.filterPanel.searchPlaceholder,
      emptyTitle:
        sanitizeString(filterPanelIn.emptyTitle, 80) || base.filterPanel.emptyTitle,
      emptyDescription:
        sanitizeString(filterPanelIn.emptyDescription, 220) ||
        base.filterPanel.emptyDescription,
      resetLabel:
        sanitizeString(filterPanelIn.resetLabel, 40) || base.filterPanel.resetLabel,
      resultLabel:
        sanitizeString(filterPanelIn.resultLabel, 40) || base.filterPanel.resultLabel,
    },

    intro: {
      eyebrow: sanitizeString(introIn.eyebrow, 40) || base.intro.eyebrow,
      title: sanitizeString(introIn.title, 120) || base.intro.title,
      description:
        sanitizeString(introIn.description, 240) || base.intro.description,
    },

    collectionCards: cards,

    whySection: {
      eyebrow:
        sanitizeString(whySectionIn.eyebrow, 40) || base.whySection.eyebrow,
      title: sanitizeString(whySectionIn.title, 120) || base.whySection.title,
      items: whyItems.length ? whyItems : base.whySection.items,
    },

    finalCta: {
      eyebrow: sanitizeString(finalCtaIn.eyebrow, 40) || base.finalCta.eyebrow,
      title: sanitizeString(finalCtaIn.title, 120) || base.finalCta.title,
      description:
        sanitizeString(finalCtaIn.description, 260) || base.finalCta.description,
      primaryLabel:
        sanitizeString(finalCtaIn.primaryLabel, 40) || base.finalCta.primaryLabel,
      primaryHref:
        normalizeUrl(finalCtaIn.primaryHref) || base.finalCta.primaryHref,
      secondaryLabel:
        sanitizeString(finalCtaIn.secondaryLabel, 40) ||
        base.finalCta.secondaryLabel,
      secondaryHref:
        normalizeUrl(finalCtaIn.secondaryHref) || base.finalCta.secondaryHref,
      statItems: finalStats,
    },
  };
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
    // keep config save flow resilient even if audit logging fails
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

  const categories = normalizeShopCategories(body?.categories, defaults.categories);

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
    categories,
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
      featureBadge:
        sanitizeString(heroIn.featureBadge, 40) || base.hero.featureBadge,
      featureText:
        sanitizeString(heroIn.featureText, 180) || base.hero.featureText,
      highlights:
        normalizeSimpleStringList(heroIn.highlights, 6, 40).length > 0
          ? normalizeSimpleStringList(heroIn.highlights, 6, 40)
          : base.hero.highlights,
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
      secondaryCtaLabel:
        sanitizeString(seasonalBannerIn.secondaryCtaLabel, 40) ||
        base.seasonalBanner.secondaryCtaLabel,
      secondaryCtaHref:
        normalizeUrl(seasonalBannerIn.secondaryCtaHref) ||
        base.seasonalBanner.secondaryCtaHref,
      featureBadge:
        sanitizeString(seasonalBannerIn.featureBadge, 40) ||
        base.seasonalBanner.featureBadge,
      featureText:
        sanitizeString(seasonalBannerIn.featureText, 180) ||
        base.seasonalBanner.featureText,
      highlights:
        normalizeSimpleStringList(seasonalBannerIn.highlights, 6, 40).length > 0
          ? normalizeSimpleStringList(seasonalBannerIn.highlights, 6, 40)
          : base.seasonalBanner.highlights,
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
      secondaryCtaLabel:
        sanitizeString(brandStoryIn.secondaryCtaLabel, 40) ||
        base.brandStory.secondaryCtaLabel,
      secondaryCtaHref:
        normalizeUrl(brandStoryIn.secondaryCtaHref) ||
        base.brandStory.secondaryCtaHref,
      featureBadge:
        sanitizeString(brandStoryIn.featureBadge, 40) ||
        base.brandStory.featureBadge,
      featureText:
        sanitizeString(brandStoryIn.featureText, 180) ||
        base.brandStory.featureText,
      highlights:
        normalizeSimpleStringList(brandStoryIn.highlights, 6, 40).length > 0
          ? normalizeSimpleStringList(brandStoryIn.highlights, 6, 40)
          : base.brandStory.highlights,
      stats:
        normalizeSimpleStats(brandStoryIn.stats).length > 0
          ? normalizeSimpleStats(brandStoryIn.stats)
          : base.brandStory.stats,
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
  return PageConfig.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, data: defaults, version: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
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

exports.getContactPublic = async (req, res, next) => {
  try {
    const doc = await getOrCreate("contact", defaultContactConfig());
    const safeData = validateContactPayload(doc?.data || {});

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

exports.getContact = async (req, res, next) => {
  try {
    const doc = await getOrCreate("contact", defaultContactConfig());

    res.set("Cache-Control", "no-store");
    res.json({
      key: doc.key,
      data: validateContactPayload(doc?.data || {}),
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

exports.upsertContact = async (req, res, next) => {
  try {
    const data = validateContactPayload(req.body || {});
    const doc = await updateConfigWithVersioning(
      req,
      "contact",
      data,
      "pageConfig.contact.update"
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

exports.getCollectionsPublic = async (req, res, next) => {
  try {
    const doc = await getOrCreate("collections", defaultCollectionsConfig());
    const safeData = validateCollectionsPayload(doc?.data || {});

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

exports.getCollections = async (req, res, next) => {
  try {
    const doc = await getOrCreate("collections", defaultCollectionsConfig());

    res.set("Cache-Control", "no-store");
    res.json({
      key: doc.key,
      data: validateCollectionsPayload(doc?.data || {}),
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

exports.upsertCollections = async (req, res, next) => {
  try {
    const data = validateCollectionsPayload(req.body || {});
    const doc = await updateConfigWithVersioning(
      req,
      "collections",
      data,
      "pageConfig.collections.update"
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