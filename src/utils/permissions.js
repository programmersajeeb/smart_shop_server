const groups = [
  {
    name: "Core",
    items: ["admin:access", "*"],
  },
  {
    name: "Users",
    items: ["users:read", "users:write"],
  },
  {
    name: "Orders",
    items: ["orders:read", "orders:write"],
  },
  {
    name: "Products",
    items: ["products:read", "products:write"],
  },
  {
    name: "Audit",
    items: ["audit:read"],
  },
  {
    name: "System",
    items: ["settings:read", "settings:write"],
  },
];

const permissions = Array.from(
  new Set(groups.flatMap((g) => g.items))
).sort((a, b) => a.localeCompare(b));

module.exports = { groups, permissions };
