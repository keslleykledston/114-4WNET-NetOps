# PHASE H3.2A.2 — SNMP Credential Resolution Architecture Report

**Date:** 2026-05-27  
**Phase:** H3.2A.2 (docs only)  
**Status:** **GO (architecture)**

---

## 1) Objetivo

Consolidar arquitetura de resolução de community SNMP para coletores operacionais, sem executar rede e sem manipular segredos.

---

## 2) Artefatos entregues

| Arquivo | Tipo |
|--------|------|
| `docs/collection/SNMP_CREDENTIAL_RESOLUTION_ARCHITECTURE.md` | Arquitetura normativa |
| `reports/collection/PHASE_H3_2A2_SNMP_CREDENTIAL_ARCHITECTURE_REPORT.md` | Relatório da fase |

---

## 3) Cadeia oficial definida

Precedência aprovada:

1. `device.snmp_community`
2. `device.snmp_profile_id`
3. `tenant.snmp_profile_id`
4. `credential_profile` (read-only)
5. `env fallback` (somente lab)

Se nada resolver: `source=none`, `available=false`, `length=0`.

---

## 4) Contrato interno aprovado

`resolveSnmpCredential(device)` retorna:

```json
{
  "source": "device|device_profile|tenant_profile|env|none",
  "available": true,
  "length": 9
}
```

Sem retorno de valor da community.

---

## 5) Segurança e persistência

### Confirmado

- nunca logar segredo
- nunca persistir credencial resolvida
- apenas metadados (`source`, `available`, `length`)

### Explicitamente proibido

- snapshot/config parse/hardcode/localStorage como fonte
- salvar segredo em snapshot/job/audit payload

---

## 6) Erros padronizados definidos

- `SNMP_CREDENTIAL_NOT_CONFIGURED`
- `SNMP_CREDENTIAL_PROFILE_NOT_FOUND`
- `SNMP_CREDENTIAL_DISABLED`

---

## 7) Compatibilidade declarada

Arquitetura vale para:

- H2 interfaces
- H3 BGP peers
- futuro OSPF/MPLS operacional

---

## 8) Critérios GO/NO-GO

### GO

- [x] cadeia definida
- [x] sem segredo
- [x] sem rede
- [x] sem código

### NO-GO (mantido como regra)

- [x] não usar env como produção
- [x] não duplicar community em múltiplas fontes persistidas
- [x] não salvar segredo em snapshot

---

## 9) Próximo passo (fora desta fase)

Implementar `resolveSnmpCredential(device)` em código com testes unitários, mantendo:

- `env fallback` restrito a lab
- produção sem fallback por env
- logs sem segredo

