const login = await fetch("http://127.0.0.1:8085/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.ADMIN_PASSWORD ?? "admin123456",
  }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const r = await fetch("http://127.0.0.1:8085/api/compliance/jobs/60/report/download?format=json", { headers: { Cookie: cookie } });
const j = await r.json();
const fails = j.findings.filter((f) => f.status === "fail");
const keys = [
  "GATEWAY-IPV6", "AS266208-4WNET-V6-332", "C17-BLOCKLIST-IPV6", "C17-PREFIX-PREFERENCE-IPV6",
  "C17-IMPORT-IPV6", "MALHA-MNS-Export-IPv6",
  "AS268707-4WNET", "GATEWAY-IPV4", "DEFAULT", "C17-PREFIX-PREFERENCE-IPV4",
  "172.28.1.138", "WIFIZAO", "IX-AM", "IX-RR", "peer-group MALHA",
];
for (const k of keys) {
  const m = fails.filter((f) => JSON.stringify(f).includes(k));
  console.log(k, "fail", m.length);
}
const mis = fails.filter((f) => /referencia ip-prefix.*(IPV6|GATEWAY-IPV6|AS266208|C17-BLOCKLIST|C17-PREFIX-PREFERENCE-IPV6)/i.test(f.message ?? ""));
console.log("misclassified ipv6-as-ip-prefix", mis.length);
const v6meta = j.findings.filter((f) => {
  const md = f.metadata ?? f.metadataJson ?? {};
  return md.dependencyType === "ipv6-prefix" || (typeof md === "object" && JSON.stringify(md).includes("ipv6-prefix"));
});
console.log("findings with ipv6-prefix metadata", v6meta.length, v6meta.slice(0, 2).map((f) => ({ status: f.status, msg: (f.message ?? "").slice(0, 80) })));
const pass172 = j.findings.filter((f) => /172\.28\.1\.138/.test(JSON.stringify(f)));
console.log("172.28.1.138 rows", pass172.length, pass172.map((f) => f.status));
