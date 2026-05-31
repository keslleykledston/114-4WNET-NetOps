# Config History e Diff

FASE 5.3 transforma `collected_configs` em histórico navegável por device.

## Tabelas

`collected_configs` continua sendo a fonte do snapshot bruto e dados de parser.

`config_diffs` armazena um diff por snapshot:

- `device_id`
- `previous_config_id`
- `current_config_id`
- `diff_summary`
- `diff_text`
- `created_at`

`current_config_id` é único para evitar duplicação quando o mesmo snapshot for processado mais de uma vez.

## Geração

Sempre que um novo registro é salvo em `collected_configs`, a API chama `createConfigDiffForCollectedConfig`.

Fluxos cobertos:

- bundle SSH via connector (`connector_ssh_bundle`);
- coleta direta em `/api/collected-configs`;
- discovery SSH live que persiste running config.

O motor busca a versão anterior do mesmo device por `collected_at` e `id`. Se não houver versão anterior, grava um diff inicial com linhas adicionadas.

## Algoritmo

O diff é linha-a-linha usando LCS:

```diff
- peer 10.0.0.2 enable
- undo shutdown
 peer 10.0.0.3 enable
```

O resumo informa:

- snapshot inicial;
- sem mudanças;
- contagem `+added -removed unchanged`.

## API

```http
GET /api/devices/:id/config-history
GET /api/configs/:id
GET /api/configs/:id/diff
```

`config-history` retorna metadados navegáveis:

- data;
- origem;
- tamanho em bytes;
- hash SHA-256;
- parser status;
- vínculo com diff e versão anterior.

`/api/configs/:id` retorna o snapshot completo para visualização e download.

`/api/configs/:id/diff` retorna o diff persistido; se estiver ausente para um snapshot legado, a API tenta gerá-lo sob demanda.

## UI

Device → Config → Config History.

Ações:

- Visualizar;
- Comparar com anterior;
- Baixar.
