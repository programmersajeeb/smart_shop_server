const groups = [
  {
    name: "Core",
    description: "Platform-wide admin access and super-level controls.",
    items: ["admin:access", "*"],
  },
  {
    name: "Users",
    description: "User listing, editing, blocking, and RBAC management.",
    items: ["users:read", "users:write"],
  },
  {
    name: "Orders",
    description: "Order viewing and operational updates.",
    items: ["orders:read", "orders:write"],
  },
  {
    name: "Products",
    description: "Product catalog viewing and editing.",
    items: ["products:read", "products:write"],
  },
  {
    name: "Audit",
    description: "Audit log and compliance visibility.",
    items: ["audit:read"],
  },
  {
    name: "System",
    description: "Settings and system configuration access.",
    items: ["settings:read", "settings:write"],
  },
];

const permissions = Array.from(new Set(groups.flatMap((g) => g.items))).sort((a, b) =>
  a.localeCompare(b)
);

const dependencyMap = {
  "users:write": ["users:read"],
  "orders:write": ["orders:read"],
  "products:write": ["products:read"],
  "settings:write": ["settings:read"],
};

const templates = {
  "Admin Access Only": ["admin:access"],
  "User Manager": ["admin:access", "users:read", "users:write"],
  "Order Manager": ["admin:access", "orders:read", "orders:write"],
  "Catalog Manager": ["admin:access", "products:read", "products:write"],
  Auditor: ["admin:access", "audit:read"],
  "Support Staff": ["admin:access", "users:read", "orders:read"],
  "Read Only Admin": [
    "admin:access",
    "users:read",
    "orders:read",
    "products:read",
    "settings:read",
    "audit:read",
  ],
};

const rolePresets = {
  user: {
    role: "user",
    roleLevel: 0,
    permissions: [],
  },
  auditor: {
    role: "auditor",
    roleLevel: 10,
    permissions: templates.Auditor,
  },
  editor: {
    role: "editor",
    roleLevel: 20,
    permissions: templates["Catalog Manager"],
  },
  support: {
    role: "support",
    roleLevel: 30,
    permissions: templates["Support Staff"],
  },
  manager: {
    role: "manager",
    roleLevel: 40,
    permissions: [
      "admin:access",
      "users:read",
      "orders:read",
      "orders:write",
      "products:read",
      "products:write",
      "audit:read",
    ],
  },
  admin: {
    role: "admin",
    roleLevel: 50,
    permissions: [
      "admin:access",
      "users:read",
      "orders:read",
      "orders:write",
      "products:read",
      "products:write",
      "settings:read",
      "audit:read",
    ],
  },
  superadmin: {
    role: "superadmin",
    roleLevel: 100,
    permissions: ["*"],
  },
};

module.exports = {
  groups,
  permissions,
  dependencyMap,
  templates,
  rolePresets,
};