# Compliance Engine V2

v0.2.4 move compliance para engine estruturado baseado em `discovery_snapshot`.

Fluxo:
1. Carrega device.
2. Carrega último `discovery_snapshot`.
3. Carrega última `collected_config` quando existe.
4. Define `source` e `confidence`.
5. Executa checks por contexto.
6. Persiste findings enriquecidos.
7. Atualiza `compliance_jobs`.

Contextos:
- `security`
- `ntp`
- `interface`
- `bgp`
- `l3vpn`
- `l2vpn`

Compatibilidade:
- policies antigas `regex`, `presence`, `absence` ainda rodam quando `raw_config` existe.
- policies novas usam `rule_type=structured`.
- scheduler chama `executeJob()` e herda engine nova.

Status finding:
- `pass`
- `fail`
- `warning`
- `unknown`

Campos enriquecidos:
- `source`
- `confidence`
- `object_type`
- `object_id`
- `object_name`
- `rule_id`
- `rule_name`
- `recommendation`
- `blocking`
- `metadata_json`
