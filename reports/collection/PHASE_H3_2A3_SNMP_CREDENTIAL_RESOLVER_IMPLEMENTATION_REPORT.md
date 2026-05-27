# PHASE H3.2A.3 — SNMP Credential Resolver Implementation Report

**Date:** 2026-05-27
**Base:** `156e807` (H3.1 skeleton) + `f7f8461` / `PHASE_H3_1B` / H3.2 docs
**Status:** **GO** (implementation + offline selftests)

---

## 1) Objetivo

Implementar `resolveSnmpCredential(device)` como serviço reutilizável para coletores operacionais **SNMP** (H2 interfaces, H3 BGP, futuro OSPF/MPLS).

Requisitos cumpridos nesta fase:

- **zero SNMP**
- **zero SSH**
- **zero discovery**
- **sem alteração de devices**
- **sem persistência de segredo**
- **sem snapshot/parsed_config**
- env fallback permitido apenas em lab/test

---

## 2) Entrega (arquivos)

### Módulo

`workspace/artifacts/api-server/src/modules/netops/snmp/snmp-credential-resolver.ts`

- cadeia oficial: `device -> device_profile -> tenant_profile -> env(lab) -> none`
- contrato: `source`, `available`, `length`, `value` (interno) e `errorCode`
- helper: `describeSnmpCredentialResolution()` nunca retorna `value`

### Integração H3 (pré-check)

`workspace/artifacts/api-server/src/modules/operational-bgp/operational-bgp.service.ts`

- antes do préflight/collect, usa `resolveSnmpCredential()`
- se credencial não estiver disponível, retorna erro de credencial antes de qualquer operação SNMP
- não altera comportamento live quando gate/bloqueio já está off

---

## 3) Selftests (offline)

Rodado como pedido:

- `pnpm typecheck` (PASS)
- `pnpm --filter @workspace/api-server run build` (PASS)
- `pnpm dlx tsx tools/snmp-credential-resolver-selftest.mjs` (PASS)
- `pnpm dlx tsx tools/snmp-fast-bgp-selftest.mjs` (PASS)
- `pnpm dlx tsx tools/snmp-fast-bgp-preflight-selftest.mjs` (PASS)

Selftest não executa SNMP/SSH.

---

## 4) Casos do selftest cobertos

A. `device.snmp_community` -> `source=device` e `length>0`
B. device empty + env lab -> `source=env`
C. production + env fallback proibido -> `source=none` + `SNMP_CREDENTIAL_NOT_CONFIGURED`
D. profile disabled -> `SNMP_CREDENTIAL_DISABLED`
E. profile id inexistente -> `SNMP_CREDENTIAL_PROFILE_NOT_FOUND`
F. nenhum -> `SNMP_CREDENTIAL_NOT_CONFIGURED`
G. `describe` nunca contém `value`

---

## 5) Segurança

Garantias:

- `value` nunca é retornado por `describeSnmpCredentialResolution`
- nenhum arquivo/DB/snapshot recebe comunidade resolvida
- logs e contratos externos não exportam valor

---

## 6) Critério GO / NO-GO

### GO

- [x] resolver implementado
- [x] selftest PASS
- [x] H3 usa resolver para erro antes de qualquer tentativa de SNMP (pré-check)
- [x] `value` nunca aparece no describe/selftest outputs
- [x] zero SNMP / zero SSH / zero discovery

### NO-GO (evitado)

- [x] não executado SNMP real
- [x] não usado snapshot/config parse
- [x] não habilitado env fallback como produção

---

## 7) Próximo passo (fora desta fase)

- aplicar resolver também no coletor H2 interfaces (opcional/prep)
- implementar storage/lookup real de `device.snmp_profile_id` / `tenant.snmp_profile_id` quando o schema existir