# Project Status

## Projeto

- Nome: `114-4WNET-NetOps`
- Objetivo: plataforma NetOps para inventário, validação, coleta e automação de dispositivos de rede
- Estrutura:
  - `workspace/` — monorepo app/API/libs
  - `infra/` — nginx e arquivos de infra
  - raiz — bootstrap Docker, compose e documentação operacional

## Stack

- Frontend: React, Vite, Wouter, shadcn/ui, Tailwind
- Backend: Express 5, TypeScript, esbuild
- Banco: PostgreSQL, Drizzle ORM
- Integrações de rede:
  - SSH via `ssh2`
  - SNMP via `net-snmp`
- Tipagem/contrato:
  - OpenAPI em `workspace/lib/api-spec/openapi.yaml`
  - geração de client React Query e schemas Zod via Orval

## Funcionalidades Implementadas

### Inventário de dispositivos

- cadastro de dispositivo com:
  - hostname
  - IP
  - vendor
  - platform
  - site
  - role
  - porta SSH
  - usuário
  - senha criptografada
  - comunidade SNMP
- listagem de dispositivos
- visualização de detalhes do dispositivo
- exclusão de dispositivo
- edição de dispositivo:
  - botão de edição na listagem
  - botão de edição na tela de detalhe

### Validação de conectividade

- teste de conexão SSH por dispositivo
- atualização de status do dispositivo:
  - `active`
  - `unreachable`
  - `unknown`
- atualização de `last_seen` quando a conexão é bem-sucedida

### Compliance

- cadastro e gestão de políticas de compliance
- execução de jobs de compliance por contexto
- armazenamento de findings
- visão de resumo e histórico

### Provisioning

- jobs de provisionamento
- steps por dispositivo
- templates de configuração

### Coleta via SSH

- coleta de configuração de dispositivo
- parsing básico de:
  - VLANs
  - interfaces
  - peers BGP
  - L2VPN
  - L3VPN
- persistência da última configuração coletada

### Coleta via SNMP

- campo `Comunidade SNMP` disponível no cadastro e edição
- tabela `snmp_snapshots` criada no banco
- poller SNMP iniciado no backend
- ciclo de coleta configurado para 5 minutos
- persistência de snapshots com:
  - sucesso/erro
  - interfaces
  - peers BGP
  - VRFs

## Estado Atual Validado

- stack Docker sobe com:
  - `netops-db`
  - `netops-migrate`
  - `netops-api`
  - `netops-web`
- healthchecks OK para API, banco e frontend
- `pnpm run typecheck` OK
- conexão SSH validada no dispositivo cadastrado `4WNET-BVA-BRT-RX`

## Dados Relevantes do Modelo

### Tabelas principais

- `devices`
- `device_groups`
- `compliance_policies`
- `compliance_jobs`
- `compliance_findings`
- `config_templates`
- `provisioning_jobs`
- `provisioning_steps`
- `collected_configs`
- `snmp_snapshots`

### Dados gravados em `snmp_snapshots`

- `device_id`
- `success`
- `error_message`
- `interfaces_json`
- `bgp_peers_json`
- `vrfs_json`
- `collected_at`

## Pendências

### SNMP

- dispositivo atual ainda está sem `snmp_community` preenchida no banco
- sem comunidade configurada, poller SNMP inicia mas não coleta desse device
- coleta SNMP atual está implementada com foco inicial em:
  - interfaces padrão IF-MIB
  - peers BGP Huawei
  - VRFs derivadas do contexto BGP Huawei
- falta ampliar suporte multi-vendor/multi-platform para:
  - Cisco
  - Juniper
  - Nokia
- falta definir OIDs e parsing mais completos para:
  - VRF/interface binding
  - BGP peers por VRF em outros vendors
  - contadores adicionais de peering e interface

### Produto

- falta tela dedicada para consultar histórico SNMP persistido
- falta API explícita para leitura de snapshots SNMP
- falta agendamento configurável por UI
- falta feedback visual no frontend para:
  - status da coleta SNMP
  - última coleta SNMP
  - erro da última coleta SNMP

### Operação

- remoto git ainda precisava ser configurado no repositório local
- falta pipeline CI/CD
- falta secrets management formal para ambientes fora do Docker local
- falta definir estratégia de backup do PostgreSQL

## Próximos Passos Recomendados

1. Preencher `snmp_community` do dispositivo real e forçar coleta de teste.
2. Expor endpoint para consulta de `snmp_snapshots`.
3. Criar tela no frontend para interfaces, BGP peers e VRFs coletadas por SNMP.
4. Expandir mapeamento SNMP para mais vendors e tabelas.
5. Adicionar CI para `typecheck`, build e smoke tests Docker.
