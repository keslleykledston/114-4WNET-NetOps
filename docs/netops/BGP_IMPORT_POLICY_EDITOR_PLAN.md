# BGP Import Policy Editor Plan

**Fase:** 6+7 (Preview 6, Apply 7)  
**Status:** 📋 Planejamento  
**Objetivo:** Safe import route-policy editing para clientes via UI preview sem execução real

## Scope

### Permitido
- Editar `apply community` em nodes de import policy
- Editar modo individual → community-list e vice-versa
- Visualizar diff lógico antes de apply
- Confirmar mudanças com preview visual
- Áuditoria completa de tentativas

### Bloqueado
- Editar export policy
- Editar if-match conditions
- Editar local-preference actions
- Editar deny final node
- Criar peers novos
- Apply real (FASE 7 somente, com RBAC)
- SSH write direto

## FASE 6: Preview + Validation (Seguro)

### 1. Inventário Persistido

**Snapshot:**
```typescript
{
  "collector": "snmp",
  "collectorVersion": "phase5",
  "collectedAt": "2026-05-21T02:01:07.965Z",
  "bgpPeers": [{
    "peerIp": "10.20.0.13",
    "remoteAs": 268707,
    "state": "established",
    "source": "snmp",
    "importPolicy": "import-policy-v4-customers",  // from config
    "description": "Customer ABC"
  }],
  "configSnapshot": {
    "bgpConfiguration": "...",
    "routePolicies": {...},
    "communities": {...},
    "vrfs": [...]
  }
}
```

### 2. SSH Config Collection (Read-Only)

**Commands:**
```
display current-configuration configuration bgp
display route-policy import-policy-v4-customers
display ip ip-prefix
display ip community-filter
```

**Parser Output:**
```typescript
{
  "peerImportPolicies": {
    "10.20.0.13": "import-policy-v4-customers"
  },
  "routePolicies": {
    "import-policy-v4-customers": {
      "nodes": [
        {
          "id": 10,
          "ifMatch": ["ip-prefix customer-abc-in"],
          "apply": [
            {"type": "community", "community": "65001:100"}
          ]
        },
        {
          "id": 20,
          "apply": [{"type": "community-list", "list": "CUSTOMER_COMMUNITIES"}]
        }
      ]
    }
  },
  "communities": {
    "CUSTOMER_COMMUNITIES": ["65001:100", "65001:101"]
  }
}
```

### 3. Backend Read-Only Endpoints

**GET /bgp-peers/{id}?role=customer**
```json
{
  "peerIp": "10.20.0.13",
  "remoteAs": 268707,
  "state": "established",
  "role": "customer",
  "importPolicyName": "import-policy-v4-customers",
  "importPolicy": {...},
  "canEdit": true
}
```

**GET /route-policies/{name}**
```json
{
  "name": "import-policy-v4-customers",
  "nodes": [...],
  "communities": [...],
  "canEdit": ["nodes[*].apply"],
  "cannotEdit": ["nodes[*].ifMatch", "nodes[*].localPreference"]
}
```

### 4. Preview Engine (Local, No SSH)

**Input:**
```typescript
{
  "peerIp": "10.20.0.13",
  "nodeId": 10,
  "change": {
    "type": "update",
    "field": "apply",
    "oldValue": [{"type": "community", "community": "65001:100"}],
    "newValue": [{"type": "community-list", "list": "CUSTOMER_COMMUNITIES"}]
  }
}
```

**Validation:**
```typescript
{
  "valid": true,
  "warnings": [
    "Mode change: individual → community-list. This affects priority.",
    "New list CUSTOMER_COMMUNITIES has 2 communities: 65001:100, 65001:101"
  ],
  "diff": {
    "nodeId": 10,
    "before": "if-match ip-prefix customer-abc-in apply community 65001:100",
    "after": "if-match ip-prefix customer-abc-in apply community-list CUSTOMER_COMMUNITIES"
  },
  "expectedCommands": [
    "route-policy import-policy-v4-customers",
    "node 10",
    "apply community-list CUSTOMER_COMMUNITIES",
    "quit"
  ]
}
```

### 5. UI Preview (No Button to Apply Yet)

**Component:**
```tsx
<BGPPeerEditor peer={peer}>
  <PolicyNodeCard node={node} editable={true}>
    <SelectCommunityMode>
      <RadioGroup value={mode}>
        <Radio value="individual">Individual Communities</Radio>
        <Radio value="list">Community List</Radio>
      </RadioGroup>
    </SelectCommunityMode>
    <CommunitySelector
      mode={mode}
      available={availableCommunities}
      selected={currentApply}
    />
    <PreviewDiff preview={previewResult} />
    <ConfirmationModal
      title="Preview: Route Policy Change"
      diff={preview.diff}
      expectedCommands={preview.expectedCommands}
      action="NONE_YET"  <!-- Botão desabilitado ou não renderizado -->
      note="Apply changes in FASE 7 with full RBAC and auditoria."
    />
  </PolicyNodeCard>
</BGPPeerEditor>
```

### 6. Auditoria Preview

**Log (sem apply real):**
```json
{
  "event": "bgp_import_policy_preview",
  "timestamp": "2026-05-21T10:30:00Z",
  "user": "user@example.com",
  "peer": "10.20.0.13",
  "peerRole": "customer",
  "policy": "import-policy-v4-customers",
  "nodeId": 10,
  "proposedChange": {...},
  "previewValid": true,
  "expectedCommands": [...],
  "status": "preview_only",
  "applied": false
}
```

## FASE 7: Apply Real + RBAC (Futuro)

### 1. Prerequisites
- ✅ RBAC: `bgp:edit:import-policy:customer`
- ✅ SSH write credentials (encrypted, separate)
- ✅ Dual approval: user + admin
- ✅ Ticket/audit trail integration
- ✅ Network change window (não aplicar fora de janela)

### 2. Apply Flow
1. User submits change → stored in DB as pending
2. Admin receives alert → reviews diff
3. Admin approves → system schedules SSH write
4. SSH session opens → sends commands
5. Device validates → ack/nack
6. Auditoria final → email notification

### 3. Rollback
- Store original policy node
- If validation fails, auto-rollback to previous node state
- Manual rollback interface para operator

## Segurança (FASE 6+7)

### Anti-Patterns
- ❌ Não permitir editar node condition (if-match)
- ❌ Não permitir alterar deny final
- ❌ Não permitir create/delete nodes
- ❌ Não permitir editar policy de export
- ❌ Não permitir editar diferentes peers ao mesmo tempo

### Validações Obrigatórias
- ✅ Community existe em library
- ✅ Community-list existe em config
- ✅ Peer ainda está em estado válido (up)
- ✅ Policy ainda contém este node
- ✅ Peer role ainda é "customer" (não mudou)
- ✅ SSH não foi executado entre preview e apply

### Rate Limiting
- Max 3 policy edits por peer por hora
- Max 1 simultaneous edit por device
- Rollback automático se device invalida config

## Arquivos Modificados

```
docs/netops/BGP_IMPORT_POLICY_EDITOR_PLAN.md (este)
docs/netops/ROUTE_POLICY_PARSER_SPEC.md
docs/netops/COMMUNITY_LIBRARY_SPEC.md
workspace/artifacts/api-server/src/modules/netops/bgp/import-policy-editor.ts
workspace/artifacts/api-server/src/modules/netops/bgp/policy-preview-engine.ts
workspace/artifacts/netops-manager/src/features/bgp/bgp-import-policy-editor.tsx
workspace/lib/api-spec/openapi.yaml
```

## Critério de Aceite (FASE 6)

- ✅ Endpoints preview retornam valid/invalid
- ✅ UI mostra preview sem ativar apply
- ✅ Validações bloqueiam edições inválidas
- ✅ Auditoria loga tentativas
- ✅ Segurança: node deny final não editável
- ✅ Segurança: if-match não editável
- ✅ BGP IPv4 peers continuam normais
- ✅ Operadoras/CDN/IX continuam apenas leitura

## Próximos Passos

1. **FASE 5.1.fix:** Corrigir IF-MIB (P0)
2. **FASE 5.2:** Inventário persistido + SSH config collection
3. **FASE 6:** Policy preview engine + UI
4. **FASE 7:** Apply real + RBAC + auditoria completa
