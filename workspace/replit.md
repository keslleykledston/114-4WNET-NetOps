# NetOps Manager

Plataforma de gerenciamento de rede para ISPs/Telecoms — cadastro de dispositivos, análise de compliance, provisionamento de L2VPN/L3VPN e validação de configurações.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, exposed at `/api`)
- `pnpm --filter @workspace/netops-manager run dev` — run the frontend (port 24780, exposed at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET` (for password encryption)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter + shadcn/ui + Tailwind CSS (dark-mode NOC theme)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- SSH: ssh2 (device connectivity for config collection and provisioning)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — Drizzle ORM table definitions (devices, compliance, templates, provisioning, collected_configs)
- `artifacts/api-server/src/routes/` — Express route handlers (one file per domain)
- `artifacts/api-server/src/lib/crypto.ts` — AES-256-CBC password encryption/decryption
- `artifacts/api-server/src/lib/ssh.ts` — SSH connectivity, command execution, config parsing
- `artifacts/netops-manager/src/` — React frontend (pages, components, theme)

## Architecture decisions

- **Password encryption at rest**: Device credentials are AES-256-CBC encrypted using SESSION_SECRET before storage. Never stored in plaintext.
- **Contract-first API**: OpenAPI spec → Orval codegen → typed React Query hooks + Zod server validators. No hand-written types.
- **Simulated SSH for dev**: SSH collection/provisioning will timeout gracefully on unreachable devices and mark them as `unreachable`. Real devices work transparently.
- **Netbox-ready schema**: `netbox_device_id` field on devices table, SNMP community hierarchy — ready for future integration.
- **Config parsing**: Vendor-aware parsers for Cisco (IOS/IOS-XE/IOS-XR) and Huawei (VRP) — extracts VLANs, interfaces, BGP peers, L2VPN/L3VPN instances from raw SSH output.

## Product

- **Device Registry**: Cadastro de dispositivos com IP, vendor, platform, credenciais criptografadas, site, role
- **Compliance Engine**: Políticas configuráveis (regex/presence/absence/range) por contexto (sysname, vlan, bgp, ntp, snmp, security, l2vpn, l3vpn) — executa via SSH e reporta findings por severidade
- **Provisioning Hub**: Wizard de provisionamento L2VPN/L3VPN — selecionar dispositivos, template, parâmetros, validar, executar, monitorar steps
- **Config Collection**: Coleta de configuração via SSH, parser local de VLANs/interfaces/BGP/VPN, histórico por dispositivo
- **Templates**: Templates de configuração (Jinja2-style) por vendor/platform para L2VPN, L3VPN, VLAN

## User preferences

- Interface em português (PT-BR) no contexto de comunicação
- Dark mode por padrão, tema industrial/NOC (deep blue/cyan)
- Conceito de compliance guiado (similar a k3gsolutions/59-netbox-sync)
- Banco de dados local primeiro, integração Netbox no futuro

## Gotchas

- Sempre rodar `pnpm run typecheck:libs` após mudar o schema do DB antes de fazer typecheck do api-server
- Após mudar o openapi.yaml, rodar codegen antes de usar os hooks
- SSH timeout é 10s para test-connection e 60s para coleta completa — dispositivos inalcançáveis são marcados como `unreachable`
- O campo `password_encrypted` usa formato `iv_hex:data_hex` — nunca alterar manualmente

## Netbox Integration (futuro)

O ambiente está pronto para integração:
- Campo `netbox_device_id` na tabela `devices`
- Campo `snmp_community` com suporte a hierarquia (device > tenant > env var)
- Deixar o fluxo de `Compliance Guiado` apontando para Netbox como fonte de dispositivos
