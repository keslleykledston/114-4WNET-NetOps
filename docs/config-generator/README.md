# Config Generator — documentação

Engine oficial de preview de provisionamento (MVP fechado, preview-only). A UI principal é `/provisioning`; `/config-generator` é a rota técnica equivalente.

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [CONFIG_GENERATOR_MVP_CLOSURE.md](./CONFIG_GENERATOR_MVP_CLOSURE.md) | **Entrada operacional** — checklist de segurança, smoke manual, critérios de aceite |
| [CONFIG_GENERATOR_MVP.md](./CONFIG_GENERATOR_MVP.md) | Escopo MVP, endpoints, selftests |
| [ID_ALLOCATOR.md](./ID_ALLOCATOR.md) | Catálogo K3G, inventário e sugestão de IDs |
| [CHANGE_REQUEST_PREVIEW.md](./CHANGE_REQUEST_PREVIEW.md) | Pacote de change request (diff, risco, ticket markdown) |
| [TEMPLATES_L2VPN.md](./TEMPLATES_L2VPN.md) | Templates L2VPN VLAN, PTP/L2VC, PTMP/VSI |
| [PROVISIONING_PREVIEW_ONLY.md](../provisioning/PROVISIONING_PREVIEW_ONLY.md) | Política preview-only e relação com provisioning legado |

## Flags (default OFF)

- `CONFIG_GENERATOR_ENABLED=false`
- `CONFIG_WRITE_ENABLED=false`
- `CONFIG_APPLY_ENABLED=false`

Controlled Execution **não** é invocado pelo MVP.

## Código

- Backend: `workspace/artifacts/api-server/src/modules/config-generator/`
- UI: `workspace/artifacts/netops-manager/src/pages/config-generator.tsx` (reexportada em `/provisioning`)
- OpenAPI: prefixo `/api/config-generator/*`
