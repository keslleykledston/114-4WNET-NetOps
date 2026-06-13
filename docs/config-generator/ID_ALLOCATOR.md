# Config Generator — ID Allocator (preview-only)

Fase `CONFIG-GENERATOR.ID-ALLOCATOR`: análise e sugestão de IDs livres (VLAN, subinterface, L2VC, VSI) sem execução em device.

## Padrão VLAN K3G (rev. 2026.05)

| Range | Uso |
|-------|-----|
| 1 | Bloqueado — nunca usar |
| 2–98 | Enlaces intra-site |
| 99 | Gerência OOB (reservada) |
| 100–199 | Enlaces inter-site (untagged) |
| 200–299 | Serviços internos |
| 300–499 | Gerência CE |
| 600–799 | L2VPN PTP/PTMP |
| 800–999 | L3VPN / Internet cliente / BGP customer |
| 1000–1200 | Datacenter / servidores |
| 1201–4000 | Uso geral |
| 4001–4094 | Bloqueado (IEEE reservado) |

Catálogo versionado: `config-generator-id-ranges.ts` (`2026.05`).

## Escopo

| ID type | Escopo principal |
|---------|------------------|
| VLAN / subinterface | tenant + device (+ site via `devices.site`) |
| L2VC / VSI | tenant (colisão de service-id na rede) |

## Fontes do inventário (sem coleta nova)

- `collected_configs`
- `discovery_snapshots`
- `snmp_snapshots`
- `l2_circuits`
- BGP announcement tables (quando aplicável)

`POST /id-inventory/refresh` **reprocessa apenas dados já persistidos** — não dispara SSH/SNMP.

## Sugestão ≠ obrigação

IDs sugeridos são **recomendação**. O operador pode alterar manualmente; `fieldOrigins` registra `id_allocator` vs `manual`.

Conflitos bloqueantes (ID ocupado, VLAN 1/99/4001+, reservado) impedem render/save.

Fora do range padrão gera **warning** (ou bloqueio se política `blocking`).

## Endpoints

- `GET /api/config-generator/id-ranges`
- `GET /api/config-generator/id-inventory?tenantId=&deviceId=&idType=`
- `POST /api/config-generator/id-inventory/refresh` — operator/admin (`configGenerator.validate`)
- `POST /api/config-generator/id-allocator/suggest`
- `POST /api/config-generator/id-allocator/validate`

## RBAC

- **viewer**: leitura de ranges, inventário e sugestões
- **operator/admin**: refresh, validate IDs, render/save com validação integrada

## Flags (inalteradas)

- `CONFIG_GENERATOR_ENABLED=false` (default)
- `CONFIG_WRITE_ENABLED=false` (default) — sem apply/execute

## Limitações

- Inventário depende de snapshots/configs já coletados
- Site numérico (`site_id`) reservado; escopo de site usa `devices.site` (`site_code`)
- Reserva global de preview ID ainda não bloqueia tenant inteiro

## Testes

```bash
DATABASE_URL=postgres://selftest:selftest@127.0.0.1:1/selftest \
  pnpm --dir ./workspace/scripts exec tsx \
  ../artifacts/api-server/src/modules/config-generator/config-generator.id-allocator.selftest.ts
```
