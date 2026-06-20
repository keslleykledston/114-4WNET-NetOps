BGP Announcement Matrix entregue em branch limpa BGP-only.

**Fluxo validado:**
refresh → preview → draft → approval → dry-run → postcheck → rollback dry-run → rollback postcheck.

**Segurança:**
- Execução real OFF por default (`BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false`)
- Rollback real OFF por default (`BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false`)
- Dry-run não abre SSH — apenas `would_execute`
- Customer export e Cxx upstream **não** entram como target da matriz
- Cxx upstream fica audit-only

**Validações locais:**
- typecheck PASS
- full suite 24/24 PASS
- e2e PASS
- web build PASS

**Homologação:**
- NOC aprovado com ressalvas documentadas
- Device #94 validou fluxo seguro
- Postcheck inconclusivo sem write real é **esperado** em modo dry-run

**Deploy pós-merge:**
- Aplicar migrations 0057–0062
- Manter flags OFF
- Rebuild api/web
- Validar UI e refresh em device de teste

Relatórios: `reports/bgp-announcements/BGP_ANNOUNCEMENT_POST_HOMOLOGATION_DEPLOY_READINESS.md`
