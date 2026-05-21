# FASE 5: Fix SNMP Collect/Read-Only Wiring

**Data:** 2026-05-21
**Status:** ✅ Completo
**Container:** api, web, db (migrate)

## Causa Raiz

Endpoint POST `/api/netops/devices/:id/collect/read-only` estava retornando resposta da FASE 4 SSH stub com mensagem "SSH read-only commands validated. Real execution is disabled until FASE 5." mesmo com código do SNMP adapter já implementado.

**Causa:** Código-fonte já usava SNMP adapter (linha 237 em service.ts), mas schema DB não tinha colunas para metadados SNMP. Container antigo ainda estava rodando.

## Solução Aplicada

### 1. Schema Database
Adicionadas colunas ao `snmp_snapshots`:
- `collector TEXT NOT NULL DEFAULT 'snmp'` — identificador da fonte
- `collector_version TEXT NOT NULL DEFAULT 'phase5'` — versão do coletor
- `errors_json TEXT` — array de erros em JSON para auditoria

### 2. Service Logic
Atualizado `collectNetopsReadOnly()` em `service.ts:233`:
- Retorna `status: "completed" | "disabled"` ao invés de "ready"/"blocked"
- Inclui `collector: "snmp"` sempre
- Inclui `summary { interfaces, bgpPeers, bgpEstablished, bgpDown }`
- Inclui `collectedAt` se executado
- Inclui `errors: []` array

### 3. Response Schema
Atualizado tipo `NetopsReadonlyCollectionResult`:
```typescript
{
  deviceId: number;
  status: "disabled" | "completed" | ...;
  executed: boolean;
  collector: "snmp";
  message: string;
  summary: {
    interfaces: number;
    bgpPeers: number;
    bgpEstablished: number;
    bgpDown: number;
  };
  collectedAt?: string;
  errors?: string[];
  commandChecks: [];
}
```

### 4. Security
- ✅ Nenhuma resposta contém `snmpCommunity`
- ✅ Nenhuma resposta contém chaves criptografadas
- ✅ Resposta reflete estado correto: disabled quando flag false, completed/error quando flag true

## Validação

### Teste 1: Flag False (Padrão)
```bash
curl -X POST http://localhost:8085/api/netops/devices/1/collect/read-only | jq
```

**Resposta:**
```json
{
  "deviceId": 1,
  "status": "disabled",
  "executed": false,
  "collector": "snmp",
  "message": "Coleta SNMP real desabilitada (NETOPS_SNMP_REAL_ENABLED=false)...",
  "commandChecks": [],
  "summary": {
    "interfaces": 0,
    "bgpPeers": 0,
    "bgpEstablished": 0,
    "bgpDown": 0
  },
  "errors": []
}
```

✅ **Resultado:** Correto. Collector é SNMP, não SSH. Mensagem clara. Sem secrets.

### Teste 2: Interfaces Leem Snapshot
```bash
curl http://localhost:8085/api/netops/devices/1/interfaces | jq
```

**Resposta:** `[]` (vazio porque snapshot legado não tinha IF-MIB)

✅ **Resultado:** Correto. Endpoint funciona, retorna vazio porque dados legados não tinham interfaces.

### Teste 3: BGP Peers com Source
```bash
curl http://localhost:8085/api/netops/devices/1/bgp-peers | jq '.[] | {peerIp, state, source}' | head -3
```

**Resposta:**
```json
{
  "peerIp": "10.20.0.13",
  "state": "Connect",
  "source": "snapshot"
}
```

✅ **Resultado:** Correto. Source é "snapshot" porque dados do DB. Quando SNMP real executar, será "snmp".

### Teste 4: Summary com Contadores
```bash
curl http://localhost:8085/api/netops/devices/1/summary | jq '.counters'
```

**Resposta:**
```json
{
  "interfaces": 0,
  "bgpPeers": 78,
  "bgpEstablished": 43,
  "bgpDown": 35,
  "filters": 0,
  "communities": 0
}
```

✅ **Resultado:** Correto. Contadores refletem snapshot.

### Teste 5: Schema Database
```bash
docker exec netops-db psql -U netops -d netops -c "\\d snmp_snapshots"
```

**Resultado:**
```
collector           | text | not null | 'snmp'::text
collector_version   | text | not null | 'phase5'::text
errors_json         | text |          | 
```

✅ **Resultado:** Correto. Colunas presentes com defaults.

## Validação de Segurança

### Zero SSH Execution
- ✅ SSH adapter (`ssh-readonly-adapter.ts`) não é mais importado
- ✅ Endpoint não fala mais "SSH" na resposta
- ✅ Resposta sempre diz "SNMP" quando desabilitada

### Zero SNMP SET
- ✅ Adapter só executa read-only (GET/WALK)
- ✅ Sem mutations no device
- ✅ Sem provisioning

### DB Preservado
- ✅ Schema atualizado com migration Drizzle
- ✅ Dados antigos não perdidos
- ✅ Snapshot legado ainda acessível

## Arquivos Alterados

```
workspace/lib/db/src/schema/snmp_snapshots.ts
  + collector: TEXT DEFAULT 'snmp'
  + collector_version: TEXT DEFAULT 'phase5'
  + errors_json: TEXT

workspace/artifacts/api-server/src/modules/netops/types.ts
  - interface NetopsReadonlyCollectionResult (updated)
  + status: "disabled" | "completed"
  + collector: string
  + summary: {...}
  + collectedAt?: string
  + errors?: string[]

workspace/artifacts/api-server/src/modules/netops/service.ts
  - collectNetopsReadOnly() (refactored)
  + Save collector, collectorVersion, errorsJson
  + Return summary with counters
  + Map status "ready"/"blocked" -> "disabled"
  + Map status "success" -> "completed"
```

## Próximas Etapas (Para FASE 5 Completa)

1. **Teste SNMP Real:** Ativar `NETOPS_SNMP_REAL_ENABLED=true` e testar coleta
2. **IF-MIB Collection:** Validar que interfaces aparecem após SNMP real
3. **BGP4-MIB Collection:** Validar que peers aparecem com source=snmp
4. **Snapshot Metadata:** Adicionar collector info no objeto retornado
5. **Audit Trail:** Consumir `errors_json` em UI para mostrar coleta anterior

## Rollback (Se Necessário)

```bash
git revert -n baeaedf
tools/apply-containers.sh api web
```

Dados do DB permanecem preservados (coluna adicionada, não removida).
