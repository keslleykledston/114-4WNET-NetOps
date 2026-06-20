# Versioning

## Fonte de versão

- commit Git atual
- tag, quando existir
- branch remota configurada
- build id, quando houver

## Label

Formato usado na UI:

- `tag (shortCommit)`
- fallback: `version (shortCommit)`
- fallback final: `shortCommit`

## Checagem

`POST /api/system/update/check` compara:

- commit local
- commit remoto do remote configurado

Também coleta:

- commits pendentes
- changelog resumido
- migrations pendentes
- arquivos de alto impacto
- risco estimado

## Histórico

- `system_versions` guarda instalações bem-sucedidas.
- `system_update_checks` guarda verificações.
- `system_update_runs` guarda cada tentativa de update.
