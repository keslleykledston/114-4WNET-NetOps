# Análise da Sessão BGP - Arquitetura de Coleta, Atualização e Abstração

## Visão Geral

O sistema coleta, mantém e abstrai informações de sessão BGP através de uma pipeline de descoberta em camadas que combina múltiplas fontes (SNMP, SSH) com caching inteligente e normalização semântica. A arquitetura separa claramente:

1. **Coleta** (collectors) - dados brutos via SNMP/SSH
2. **Normalização** (normalizers) - transformação em modelo comum
3. **Persistência** (storage) - armazenamento com histórico
4. **Consulta** (drilldown) - exposição com cache e dependências

---

## 1. COLETA DE DADOS (Collection Layer)

### 1.1 Fontes de Coleta

#### A. SNMP (RFC4273 + BGP4-MIB)

**Arquivo**: `operational-bgp.collector.ts` + `operational-bgp-rfc4273-snmp.ts`

**Fluxo**:
```
collectBgpPeers()
  ↓ (se NETOPS_SNMP_BGP_REAL_ENABLED)
collectLiveMode()
  ↓
withBgpSnmpSession(host, community)
  ↓
collectRfc4273BgpPeers(deviceId, session)
  ↓
walkPeerColumns() [SNMP WALK]
  ├─ bgpPeerState (1.3.6.1.2.1.15.2.1.2)
  ├─ bgpPeerAdminStatus (1.3.6.1.2.1.15.2.1.3)
  ├─ bgpPeerRemoteAs (1.3.6.1.2.1.15.2.1.4)
  ├─ bgpPeerRemoteAddr (1.3.6.1.2.1.15.2.1.7)
  └─ bgpPeerFsmEstablishedTime (1.3.6.1.2.1.15.2.1.16)
  ↓
rowsToPeers() [Normalização SNMP]
```

**Parâmetros SNMP**:
- **Timeout**: `SNMP_FAST_BGP_TIMEOUT_MS` (padrão 5s, range 3-8s)
- **Retries**: `SNMP_FAST_BGP_WALK_RETRIES` (padrão 1, range 0-1)
- **Base OID**: `1.3.6.1.2.1.15.2.1` (RFC4273)
- **Fallback**: `1.3.6.1.2.1.15.3.1` (BGP4-MIB, se RFC4273 vazio)

**Dados Coletados por Peer**:
```typescript
{
  peerIp: string;        // Extraído de bgpPeerRemoteAddr ou índice
  peerAs: number | null; // Convertido via toSnmpNumber()
  peerType: "iBGP" | "eBGP" | "unknown"; // localAs vs remoteAs
  vrf: null;            // Preenchido mais tarde
  afi: "ipv4" | "ipv6"; // Classificado por padrão IP
  safi: "unicast";      // Fixo por enquanto
  adminStatus: "stop" | "start" | "unknown";
  operStatus: "up" | "down"; // Derivado: fsmState === "established" ? "up" : "down"
  fsmState: string;     // Estados: idle, connect, active, opensent, openconfirm, established
  uptimeSeconds: number | null;  // Convertido de ticks (÷100)
  // Null por enquanto (requer roteamento):
  receivedPrefixes: null;
  acceptedPrefixes: null;
  advertisedPrefixes: null;
  lastChange: null;
}
```

#### B. SSH (Configuração Ativa)

**Arquivo**: `ssh.collector.ts`

- Executa `display bgp peer` e `display bgp peer ipv6` (Huawei)
- Retorna configurações de peer e status operacional
- Alimenta normalizer com dados de interface/rota

### 1.2 Coleta Condicional

**`shouldFallbackToSshForIpv6Bgp()`**:
- Fallback SSH se SNMP não encontrar peers IPv6
- Condição: `allowSnmpFallback=true` E `!preferLiveSsh` E `!hasIpv6BgpPeers`

**`shouldCollectSshBgpDetails()`**:
- Coleta SSH sempre disponível se credenciais existem
- Requer `contexts.includes("bgp")`

---

## 2. ARMAZENAMENTO E PERSISTÊNCIA (Persistence Layer)

### 2.1 Tabelas de Banco de Dados

**Contexto**: `@workspace/db` (Drizzle ORM)

#### A. `discoverySnapshotsTable`

Armazena snapshot completo da descoberta:

```typescript
{
  id: number;                    // PK
  deviceId: number;              // FK devices
  discoveryRunId: string;        // Identificador único: "disc-{deviceId}-{timestamp}"
  discoveryProgressId?: number;  // Rastreamento de progresso
  status: "success" | "partial" | "failed";
  contexts: string[];            // ["bgp", "interfaces", ...]
  startedAt: Date;
  finishedAt: Date;
  sourceStatus: {
    ssh: "success" | "failed" | "skipped";
    snmp: "success" | "failed" | "skipped";
    cachedConfig: "available" | "used" | "missing" | "skipped";
  };
  snapshotJson: DeviceDiscoverySnapshot; // Snapshot completo (abaixo)
  // ... campos indexados para busca rápida
}
```

#### B. `DeviceDiscoverySnapshot` (JSON)

Payload normalizado e enriquecido:

```typescript
interface DeviceDiscoverySnapshot {
  deviceId: number;
  discoveryRunId: string;
  status: "success" | "partial" | "failed";
  contexts: string[];
  startedAt: string;
  finishedAt: string;
  sourceStatus: { ssh, snmp, cachedConfig };
  persistedRunId: string | null;
  persistedSnapshotId: number | null;
  cachedFromPersistedSnapshot: boolean;
  parserVersion: string;
  parserVersions: { interface: string };
  sourcesUsed: DiscoverySource[];  // ["snmp_snapshot", "ssh_live", "local_db", ...]
  
  // Dados normalizados
  bgpPeers: BgpPeerSummary[];      // Peers com enriquecimento de policy
  interfaces: NetopsInterface[];
  policies: NormalizationPolicy[];
  communities: CommunityFilter[];
  communityLists: CommunityList[];
  prefixLists: PrefixList[];
  ipv6PrefixLists: Ipv6PrefixList[];
  asPathFilters: AsPathFilter[];
  extcommunityFilters: ExtcommunityFilter[];
  aclFilters: AclFilter[];
  vrfs: VrfSummary[];
  l2vpn: L2vpnSummary;
  
  // Configuração analisada
  parsed_config: {
    bgp_peer_model: BgpPeerModel;        // Modelo semântico de peers
    dependency_graph: DependencyGraph;   // Grafo de políticas
    ...
  };
  
  warnings: DiscoveryWarning[];
  audit: DiscoveryWarning[];
}
```

#### C. `collectedConfigsTable`

Cache da configuração bruta:

```typescript
{
  deviceId: number;
  collectedAt: Date;
  rawConfig: string;           // Config bruta SSH
  parsedInterfaces: JSON;      // Cache de interfaces normalizadas
  parsedBgp: JSON;            // Cache de peers (rápido recall)
  // ... outros campos parseados
}
```

### 2.2 Fluxo de Persistência

**Orquestrador** (`discovery.orchestrator.ts`):

```
CollectionOrchestrator.run()
  ↓ Coleta SNMP + SSH
  ├─ collectedConfigs.rawConfig
  ├─ collectedConfigs.parsedInterfaces
  └─ collectedConfigs.parsedBgp
  ↓ Normalização
  ├─ normalizeDiscoveryBgpPeers() → BgpPeerSummary[]
  ├─ enrichBgpPeersFromPolicyModel() → política ligada a peers
  └─ parseHuaweiPolicyDependencyPipeline() → parsed_config
  ↓ Construir Snapshot
  snapshot = DeviceDiscoverySnapshot { ... }
  ↓ Persistência
  ├─ rawEvidenceStore.finishRun() → persistedSnapshotId
  └─ rawEvidenceStore.saveSnapshot() → evidência
  ↓ Retorna snapshot
```

---

## 3. NORMALIZAÇÃO E ABSTRAÇÃO (Normalization Layer)

### 3.1 Normalização de Peers

**Arquivo**: `normalizers/bgp.normalizer.ts`

```typescript
normalizeDiscoveryBgpPeers(
  sshPeers: NetopsBgpPeer[],    // De SSH
  snmpPeers: NetopsBgpPeer[],   // De SNMP
  cachedPeers: NetopsBgpPeer[], // Cache anterior
  localPeers: NetopsBgpPeer[]   // BD local
): BgpPeerSummary[]
```

**Estratégia de Merge**:

1. **Deduplicação**:
   - Chave: `{peerIp}|{addressFamily}|{vrf}`
   - SSH + SNMP: preferência SSH se operStatus diferente

2. **Enriquecimento de Política**:
   ```
   enrichBgpPeersFromPolicyModel()
     ↓ Para cada peer
     ├─ Encontra root context (descrição, ASN)
     ├─ Encontra family (policies, AFI/SAFI)
     └─ Merge: description, name, importPolicy, exportPolicy
   ```

3. **Aplicar Overrides Manuais**:
   ```
   applyRoleOverrides()
     ↓ Consulta bgpPeerRoleOverridesTable
     └─ Sobrescreve: role, remoteAs, label
   ```

### 3.2 Normalização de Configuração

**Parsing de Política** (Huawei VRP):

```
parseHuaweiPolicyDependencyPipeline(configText, source)
  ↓ Parsers:
  ├─ parseHuaweiPolicies() → Route Policies
  ├─ parseHuaweiCommunities() → Community Lists
  ├─ parseHuaweiVrfs() → VRFs
  ├─ parseHuaweiPrefixLists() → Prefix Lists
  └─ parseHuaweiAclFilters() → ACL Filters
  ↓ Resultado:
  {
    bgp_peer_model: {
      roots: Map<peerKey, PeerRoot>,      // Definições de peer
      families: PeerAfiSafi[],             // Familias por peer
      ...
    },
    dependency_graph: {
      policies: DependencyNode[],
      edges: DependencyEdge[],
      bgp_policy_bindings: BgpPolicyBinding[],  // Links peer ↔ policy
    }
  }
```

### 3.3 Mapeamento de Tipo de Peer

**Fonte**: `operational-bgp-rfc4273-snmp.ts`, linhas 135-138

```typescript
let peerType = "unknown";
if (localAs != null && remoteAs != null) {
  peerType = remoteAs === localAs ? "iBGP" : "eBGP";
}
```

**Resolução de localAs** (ordem de precedência):
1. SNMP GET `1.3.6.1.2.1.15.2.0` (sysDescr)
2. `discovery.parsed_config.bgp_peer_model.localAs`
3. `null` + aviso "missing from SNMP and discovery"

---

## 4. CONSULTA E EXPOSIÇÃO (Query & Drilldown Layer)

### 4.1 Fluxo de Leitura - `getBgpPeerDrilldown()`

**Arquivo**: `bgp-peer-drilldown.service.ts`

```
getBgpPeerDrilldown(deviceId, peer, query)
  ├─ [1] Verificar cache fresco
  │   └─ getFreshBgpPeerDrilldownSnapshot()
  │      └─ BD: bgp_peer_drilldown_cache_table
  │         └─ if cache fresh & !forceRecompute → retorno com cache_meta.status="fresh"
  │
  ├─ [2] Carregar snapshot (se cache miss)
  │   ├─ Se query.snapshotId: buscar por ID
  │   ├─ Se query.jobId: buscar por discoveryRunId
  │   └─ Else: buscar último snapshot
  │
  ├─ [3] Carregar config bruta
  │   └─ collectedConfigsTable.rawConfig (último)
  │
  ├─ [4] Construir resultado
  │   └─ buildBgpPeerDrilldownResult(
  │       deviceId, peer, snapshot, rawConfig, collectedAt
  │      )
  │
  └─ [5] Persistir cache + retornar
      ├─ persistBgpPeerDrilldownSnapshot()
      └─ attachCacheMeta() → BgpPeerDrilldownResult
         {
           contractVersion: "bgp-peer-drilldown-v1",
           peer: string,
           source: DrilldownSource,
           root: BgpPeerRootConfig,      // Definição de peer
           families: BgpPeerFamilyConfig[],  // AFI/SAFI por peer
           effectivePolicies: BgpPeerEffectivePolicy[],
           policies: BgpPeerRoutePolicyDrilldown[],
           dependencies: BgpPeerDependencyEdge[],  // Grafo de deps
           cache: BgpPeerDrilldownCacheMeta
         }
```

### 4.2 Builder - `buildBgpPeerDrilldownResult()`

**Arquivo**: `bgp-peer-drilldown.builder.ts`

Extrai de `DeviceDiscoverySnapshot`:

1. **Root Config**: Encontra peer root na parsed_config
2. **Families**: Encontra AFI/SAFI e políticas efetivas
3. **Policies**: Caminha no dependency_graph a partir dos peers
4. **Dependencies**: Traça edges (peer → policy → object)

**Chave de Peer**: `normalizePolicyLookupKey(peerIp)` (normalização para lookup)

### 4.3 Comparação Histórica

```
compareBgpPeerDrilldownHistory(deviceId, peer, leftId, rightId)
  ├─ getBgpPeerDrilldownSnapshotById(deviceId, peer, leftId)
  ├─ getBgpPeerDrilldownSnapshotById(deviceId, peer, rightId)
  └─ compareBgpPeerDrilldownSnapshots(leftId, rightId, left, right)
     → Diff estruturado de configurações
```

---

## 5. CACHE E PERFORMANCE

### 5.1 Cache em Camadas

| Camada | Chave | TTL | Invalidação |
|--------|-------|-----|-------------|
| **SNMP Collector** | host + community | - | Uso único |
| **Discovery Snapshot** | deviceId + runId | Persistido | Novo discovery |
| **BGP Peer Drilldown** | deviceId + peer | ~5-10min | Recompute |
| **Collected Config** | deviceId + collectedAt | Indefinido | Próxima coleta |

### 5.2 Cache Fresco

```typescript
canUseCache = !query.snapshotId && !query.jobId 
          && query.includePolicies !== false 
          && query.includePolicyObjects !== false;

if (canUseCache && !query.forceRecompute) {
  cached = getFreshBgpPeerDrilldownSnapshot(deviceId, peer);
  if (cached) return cached; // cache.status = "fresh"
}
```

### 5.3 Invalidação

**Cenários**:
- `forceRecompute=true` → recompute (status="recomputed")
- Cache expirou → recompute (status="expired")
- Sem cache → compute (status="miss")

---

## 6. FLUXO COMPLETO - EXEMPLO

### Cenário: Usuário Consulta BGP Peer 10.1.1.1 no Router X

**T0 - Descoberta Iniciada** (`POST /discovery` ou agendado):
```
Discovery Run Start
  ├─ SNMP Walk RFC4273 → [10.1.1.1/AS65000, 10.1.1.2/AS65001, ...]
  ├─ SSH: `display bgp peer` → [10.1.1.1 desc="ISP-A", 10.1.1.2, ...]
  └─ Parse config → policies, VRFs, etc.
     ↓
Merge (SSH + SNMP)
  ├─ 10.1.1.1: remoteAs=65000, role=customer (override), importPolicy=INTERNET-INBOUND
  ├─ Enrich from policy model
  └─ Create DeviceDiscoverySnapshot
     ↓
Persist
  ├─ discoverySnapshotsTable INSERT
  ├─ collectedConfigsTable INSERT/UPDATE
  └─ rawEvidenceStore.finishRun()
```

**T1 - Usuário Consulta Peer** (`GET /bgp/drilldown/deviceId/10.1.1.1`):
```
getBgpPeerDrilldown(X, 10.1.1.1, {})
  ├─ Check cache → MISS (primeira vez)
  ├─ Load latest snapshot (T0)
  ├─ Load rawConfig
  ├─ buildBgpPeerDrilldownResult()
  │   ├─ Root: peer=10.1.1.1, asNumber=65000, description=ISP-A
  │   ├─ Family: ipv4-unicast, vrf=PUBLIC, importPolicy=INTERNET-INBOUND
  │   ├─ Policies: Walk INTERNET-INBOUND
  │   │   └─ References: prefix-list INTERNET, as-path ".*"
  │   └─ Dependencies: Edge(INTERNET-INBOUND → prefix-list INTERNET)
  ├─ persistBgpPeerDrilldownSnapshot() → cache saved
  └─ Return {
       peer: "10.1.1.1",
       root: { peer, asNumber=65000, description="ISA-A", status="FOUND" },
       families: [{ afiSafi="ipv4-unicast", importPolicy="INTERNET-INBOUND", ... }],
       effectivePolicies: [{ policyName="INTERNET-INBOUND", direction="import", status="OK" }],
       cache: { status="miss", servedFromCache=false }
     }
```

**T2 - Usuário Consulta Novamente** (< 5-10min):
```
getBgpPeerDrilldown(X, 10.1.1.1, {})
  ├─ Check cache → HIT (fresh)
  └─ Return cached result {
       cache: { status="fresh", servedFromCache=true, expiresAt=... }
     }
```

**T3 - Nova Descoberta Executada**:
```
Discovery Run (T3)
  ├─ Encontra 10.1.1.1 ainda com AS65000
  ├─ Nova snapshot criada
  └─ Cache expirado (diferente snapshotId)
     ↓
getBgpPeerDrilldown(X, 10.1.1.1, {})
  ├─ Detecta cache expirado
  ├─ Recompute com novo snapshot
  └─ Return {
       cache: { status="expired", servedFromCache=false, ... }
     }
```

---

## 7. FONTES E PRECEDÊNCIA

### 7.1 Precedência de Dados

| Item | Precedência | Lógica |
|------|------------|--------|
| **Peer IP** | SSH > SNMP Index | SSH `neighbor` preferred, fallback a SNMP index |
| **Remote AS** | SSH > SNMP > NULL | Parsed config takes priority |
| **Description** | Manual Override > SSH > Policy Model > NULL | User label > config > inference |
| **Admin Status** | SSH > SNMP | SSH running config > SNMP current |
| **Oper Status** | SNMP (FSM) | SNMP FSM state → map to up/down |
| **Policy** | Manual Override > Parsed Config > NULL | User policy > running config |

### 7.2 Rastreamento de Origem (`DiscoverySource`)

```typescript
type DiscoverySource = "ssh_live" | "snmp_snapshot" | "local_db" | "ssh_running_config" | "manual_override";

// No resultado:
rawEvidenceRefs: {
  id: number | null;
  source: DiscoverySource;          // Whence this came
  commandOrScope: string;           // "display bgp peer" vs "1.3.6.1.2.1.15"
  collectedAt: string;              // Timestamp
}[]
```

---

## 8. ARQUITETURA - DIAGRAMA

```
┌─────────────────────────────────────────────────────────────────┐
│                     API / Frontend                              │
│  GET /bgp/drilldown/{deviceId}/{peer}                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│            BGP Peer Drilldown Service Layer                     │
│  ├─ Cache Check (FRESH/EXPIRED/MISS)                           │
│  ├─ Snapshot Load (Latest or by ID)                            │
│  ├─ Builder: Extract root, families, policies, deps            │
│  └─ Result: BgpPeerDrilldownResult {cache_meta}               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│            Device Discovery Snapshot (JSON)                     │
│  ├─ bgpPeers: BgpPeerSummary[]                                  │
│  ├─ parsed_config: { bgp_peer_model, dependency_graph }         │
│  └─ sourcesUsed: ["snmp_snapshot", "ssh_live", ...]            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
┌───▼────────┐    ┌────────▼───────┐    ┌────────▼────────┐
│   SNMP     │    │      SSH       │    │  Local DB       │
│  Collector │    │   Collector    │    │   Cache         │
│            │    │                │    │                 │
│ RFC4273    │    │ display bgp    │    │ Previous        │
│ Walk       │    │ peer (live)    │    │ snapshots       │
└────────────┘    │ display route  │    └─────────────────┘
                  │ summary        │
                  └────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
    ┌────▼──────────┐              ┌────────▼────────┐
    │ Normalizers   │              │   Huawei VRP    │
    ├─ bgp.normal  │              │   Policy Parser │
    ├─ interface   │              │                 │
    └──────────────┘              └─────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  Discovery Orchestrator               │
    │  ├─ Merge sources                     │
    │  ├─ Enrich from policy model          │
    │  ├─ Apply role overrides              │
    │  └─ Build snapshot                    │
    └────┬─────────────────────────────────┘
         │
    ┌────▼────────────────────┐
    │  Persist Snapshot       │
    │  ├─ discoverySnapshots  │
    │  ├─ collectedConfigs    │
    │  └─ rawEvidence         │
    └────────────────────────┘
```

---

## 9. RETENÇÃO E HISTÓRICO

### 9.1 Snapshots Históricos

Cada nova descoberta cria nova linha em `discoverySnapshotsTable`:

```typescript
// Query histórico
getBgpPeerDrilldownHistory(deviceId, peer, limit=50)
  └─ listBgpPeerDrilldownHistory()
     └─ SELECT * FROM bgp_peer_drilldown_cache
        WHERE deviceId=X AND peer=Y
        ORDER BY createdAt DESC
        LIMIT limit
```

### 9.2 Comparação Entre Versões

```typescript
compareBgpPeerDrilldownHistory(deviceId, peer, leftId, rightId)
  └─ compareBgpPeerDrilldownSnapshots(leftId, rightId, left, right)
     → Retorna diff estruturado (policies changed, role changed, etc.)
```

---

## 10. AVISOS E DIAGNOSTICO

### 10.1 Aviso de Coleta

```typescript
// Em walkPeerColumns():
if (stateResult.status !== "ok" && stateResult.error) {
  warnings.push(`rfc4273 bgpPeerState walk: ${error.message}`);
}

// Peers incompletos:
if (remoteAs == null) {
  warnings.push(`bgp peer ${peerIp} missing remoteAs from MIB`);
}
```

### 10.2 Aviso de Remocção

```typescript
removalCandidateWarnings(
  localInterfaces, localPeers,  // Estado anterior
  freshInterfaces, freshPeers   // Nova coleta
) → warns if peer disappeared
```

### 10.3 Rastreabilidade

Cada resultado referencia evidência bruta:

```typescript
rawEvidenceRefs: [
  {
    id: 12345,
    source: "snmp_snapshot",
    commandOrScope: "1.3.6.1.2.1.15.2.1",
    collectedAt: "2026-06-13T10:30:00Z"
  },
  {
    id: 12346,
    source: "ssh_live",
    commandOrScope: "display bgp peer",
    collectedAt: "2026-06-13T10:31:00Z"
  }
]
```

---

## 11. QUESTÕES ABERTAS / FUTURO

1. **Prefix Counts** (`receivedPrefixes`, `acceptedPrefixes`, `advertisedPrefixes`)
   - Atualmente `null` (requer coleta de tabela de rota)
   - Candidato para SNMP BGP4-MIB ou SSH detail

2. **Runtime / Timers**
   - Campo `runtime` sempre `null`
   - Poderia incluir uptimeTicks já coletados

3. **IPv6 Fallback**
   - Atualmente apenas em modo SSH se SNMP falhar
   - Considerar IPv6-first para novos peers

4. **Invalidação de Cache**
   - TTL fixo vs. evento-driven (nova descoberta)
   - Considerar invalidação seletiva por mudanças

---

## Resumo

**Coleta**: SNMP (RFC4273) + SSH (running config) → CollectedBgpPeerRow[]

**Normalização**: Merge + enriquecimento de política + overrides → BgpPeerSummary[] + parsed_config

**Persistência**: DeviceDiscoverySnapshot em JSON → discoverySnapshotsTable + cache

**Consulta**: Service layer com cache em camadas → BgpPeerDrilldownResult com metadata

**Rastreabilidade**: rawEvidenceRefs + audit trail em snapshot

