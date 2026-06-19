# Test Plan

## Parser

- Extrair VS-ID.
- Extrair nome da VSI.
- Extrair peers.
- Extrair PW status.
- Extrair AC/interface.
- Extrair VLAN.
- Preservar config bruta.
- Lidar com VSI sem VS-ID.
- Lidar com config incompleta.

## Status

- UP.
- DEGRADED por PW down.
- DEGRADED por alarme.
- DOWN sem PW ativo.
- CONFIG_ONLY.
- UNKNOWN.
- Divergencia de nome.
- Divergencia de MTU/VLAN se implementado.

## API

- Lista com filtros.
- Detalhe por ID.
- Configs por VSI.
- Historico por VSI.
- Retorno vazio.
- Tenant isolation.

## Frontend

- Renderiza lista.
- Filtro por VS-ID.
- Abre detalhe.
- Mostra configs recolhidas.
- Expande config por device.
- Exibe status/alarmes.
