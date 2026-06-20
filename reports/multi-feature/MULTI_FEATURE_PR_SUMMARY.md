# Multi-Feature PR Summary

**Branch acumulada:** `kgs-145/provisioning-template-registry-fix`  
**Data:** 2026-06-20

---

## Features na branch

| Feature | Commits | PR recomendado | Prioridade |
|---------|---------|----------------|------------|
| BGP Announcement Matrix | 2304f0e–6bd00ae | `kgs-145/bgp-announcements-safe-noc` → **main** | ✅ PR limpo pronto |
| VSI/VPLS | 0610339 | branch limpa futura → main | Alta |
| System-update | e66a24d–0b115ba | branch limpa futura → main | Média |
| Copilot | d22928d | branch limpa futura → main | Média |
| Provisioning fix | 8807161 | incluir em PR VSI ou standalone | Baixa |
| Inventory UI | 43fe687 | incluir em PR relevante | Baixa |
| Graphify-out | d22928d | **não mergear** | Excluir |

---

## Validações (branch acumulada)

- typecheck **PASS**
- BGP full suite **24/24 PASS**
- BGP e2e **PASS**
- web build **PASS**
- JS artifacts **zero**

---

## Aviso escopo amplo

Branch acumulada = **291 files** vs main. **Não abrir PR único.**

Revisar por área ou usar branches limpas cherry-picked de `main`.

---

## BGP — nota de segurança

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
```

Homologação NOC aprovada com ressalvas. Execução real e rollback real **OFF**.

---

## Próximos passos

1. Abrir PR BGP na branch limpa (manual — gh ausente)
2. Cherry-pick VSI/VPLS → branch `kgs-145/vsi-vpls`
3. Cherry-pick system-update → branch `kgs-145/system-update`
4. Cherry-pick copilot (sem graphify) → branch `kgs-145/copilot`
5. Excluir graphify-out de qualquer PR para main

Detalhe: `reports/multi-feature/MULTI_FEATURE_PARALLEL_COMMIT_SCOPE.md`
