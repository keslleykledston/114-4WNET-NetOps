# V0.2.9 Community-Filter Reference Hotfix

## Causa raiz

O parser de community-filters só reconhecia a forma com `index` explícito:

`ip community-filter basic NAME index N permit VALUE`

O snapshot real do dispositivo também usa a forma válida sem índice:

`ip community-filter basic REJEITA-PREFIX-CDNS permit 64777:10064`

Além disso, a saída operacional `display ip community-filter` não era consolidada no mesmo catálogo. O check de BGP fazia lookup por nome cru e, quando o catálogo vinha incompleto, gerava falso positivo de ausência.

## Exemplo do falso positivo

Finding observado:

`Route-policy AS268707-4WNET-BRT-RX-Export-V6 referencia community ausente: REJEITA-PREFIX-CDNS`

Evidência no dispositivo:

`display ip community-filter REJEITA-PREFIX-CDNS`

`Named Community basic filter: REJEITA-PREFIX-CDNS (ListID = 314)`

`permit 64777:10064`

## Parser corrigido

- `community-parser.ts` agora aceita `community-filter` com e sem `index`.
- `community-parser.ts` consolida entradas por nome.
- `community-parser.ts` também reconhece saída operacional `display ip community-filter`.
- `policy-parser.ts` passa a emitir referência estruturada de `if-match community-filter`.
- `policy-utils.ts` normaliza nome e chave de lookup com trim e remoção de aspas.

## Compliance corrigido

- `bgp-checks.ts` agora prioriza lookup em `communityFilters` e também aceita `communityLists` e `communitySets` se existirem.
- Quando o snapshot não traz catálogo nenhum de community-filters, o check emite aviso de baixa confiança em vez de falhar cada referência individualmente.
- A mensagem falsa para `REJEITA-PREFIX-CDNS` deixa de ser gerada quando o community-filter existe no snapshot.

## Testes executados

- `node tools/compliance-community-filter-reference-selftest.mjs`
- `pnpm -C workspace --filter @workspace/api-server typecheck`
- `pnpm -C workspace --filter @workspace/netops-manager typecheck`
- `BASE_PATH=/ PORT=5000 pnpm -C workspace run build`
- `COMPLIANCE_TEST_ADMIN_EMAIL=admin@netops.local COMPLIANCE_TEST_ADMIN_PASSWORD='Admin123!ChangeMe' DEVICE_ID=1 node tools/compliance-policy-tuning-selftest.mjs`
- `DOCKER_BUILDKIT=1 docker compose up -d --build api web`
- `docker compose ps`
- `curl -fsS http://127.0.0.1:8085/api/healthz`

## Resultado no device 1

Após reexecutar discovery/compliance no device 1, não houve novo finding com:

`referencia community ausente: REJEITA-PREFIX-CDNS`

## Riscos restantes

- Snapshots antigos continuam contendo findings históricos gerados antes deste hotfix.
- O parser ainda depende da formatação Huawei VRP; novas variações de saída podem exigir ajuste adicional.
- Catálogos incompletos em jobs antigos ainda podem aparecer como legado/stale até nova coleta.

