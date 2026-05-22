# Validação SSH Real - Coleta e Compliance

## 1. Resumo executivo
- Status geral: ok.
- Device testado: `device_id=1`, `4WNET-BVA-BRT-RX`.
- SSH: ok.
- SNMP: ok.
- Discovery: full na execução; snapshot persistido e depois recarregado do cache/local DB.
- Compliance: ok, com policy read-only mínima.
- Achado principal: coleta, parser Huawei, discovery, BGP live e compliance read-only funcionam no device real.

## 2. Ambiente
- Branch: `codex/bgp-uptime-format`.
- Tag: `v0.2.2-scheduler-local`.
- Containers: `netops-api`, `netops-web`, `netops-db`.
- API base: `http://127.0.0.1:8085`.
- Usuário: `admin@netops.local` / role `admin`.
- `CONFIG_APPLY_ENABLED=false`.
- `DRY_RUN_DEFAULT=true`.

## 3. Device alvo
- id: `1`
- hostname: `4WNET-BVA-BRT-RX`
- ip: `45.169.161.255`
- vendor: `huawei`
- platform: `vrp`
- role: `RX`
- site: `BVA-BRT`
- status: `active`

## 4. Teste SSH
- Resultado: `Connected successfully`.
- Categoria: ok.
- Tempo: dentro do timeout padrão do collector.
- Evidência: sem secrets, sem dump bruto no relatório.

## 5. Coleta de configuração
- `collected_config` id: `7`.
- Status: success.
- Source: `ssh`.
- Parser version: `huawei-vrp`.
- Parser counts:
  - vlans: `6`
  - interfaces: `9`
  - bgp: `49`
  - l2vpn: `0`
  - l3vpn: `11`

## 6. Parser Huawei

| Contexto | Status | Quantidade | Evidência |
|---|---|---:|---|
| interfaces | OK | 9 | `parsedInterfaces` |
| vlans | OK | 6 | `parsedVlans` |
| bgp | OK | 49 | `parsedBgp` |
| l2vpn | OK | 0 | `parsedL2vpn` vazio |
| l3vpn/vrf | OK | 11 | `parsedL3vpn` |
| security | OK | 1 policy mínima | `compliance` read-only |
| route-policy | Parcial | n/a | presente no snapshot/discovery, não validado como parser dedicado neste round |
| community | Parcial | n/a | presente em config real, sem contagem dedicada aqui |

## 7. Discovery
- `discovery_run` id: `disc-1-1779416412053`.
- `discovery_snapshot` id: `14`.
- Status da execução: `full`.
- Status do snapshot recarregado: `cached`.
- Sources usados: `snmp_snapshot`, `ssh_live`, `local_db`.
- Warnings: `75`.

## 8. BGP
- Total peers: `76`.
- Por categoria:
  - customer: `40`
  - provider: `8`
  - ix: `8`
  - ibgp: `20`
  - cdn: `0`
- Exemplo customer:
  - `10.20.255.2`
  - direction: `import`
  - received routes query: `0`
- Exemplo provider:
  - `10.20.1.1`
  - direction: `export`
  - advertised routes query: `14`
- Exemplo IX:
  - `187.16.198.253`
  - advertised routes query: `99`
- `Peer's description` apareceu na lista onde presente.
- `Received total routes` e `Advertised total routes` usados como contador.
- `Update messages` não usado como prefix counter.

## 9. Prefixos real-time
- Query em tempo real via SSH.
- `bgp_route_history` gravado: total `37`.
- `limit=200` respeitado.
- Paginação: ok.
- Contador: recebido usa received routes; advertido usa advertised routes.

## 10. Compliance
- Job id: `7`.
- Status: `passed`.
- Pass: `1`.
- Fail: `0`.
- Findings: `1`.
- Policy usada: `ssh-real-sysname-present`.
- Sem apply, sem rollback, sem config mode.

## 11. Audit
- Eventos vistos:
  - `device_test_connectivity`
  - `collect_config`
  - `discover`
  - `route_query`
  - `compliance_create`
  - `compliance_execute`
- Actor: `Admin <admin@netops.local>`.
- Source IP: sanitizada.
- Sem password, token, SNMP community.

## 12. Frontend
- Web saudável.
- Fluxo validado por API e pelos mesmos endpoints que a UI usa.
- Telas principais seguem prontas para usar com esses dados.

## 13. Riscos e pendências
- Compliance ainda simples, só policies read-only básicas.
- Route-policy/community parser ainda sem teste dedicado completo neste round.
- Discovery warnings altos, precisa limpeza posterior.
- Apply/rollback seguem bloqueados por padrão, como deve ser.

## 14. Conclusão
- SSH real validado.
- Coleta configurada.
- Discovery full.
- BGP live ok.
- Compliance ok.
- Bom para avançar para NetBox, com cleanup posterior de parser coverage.
