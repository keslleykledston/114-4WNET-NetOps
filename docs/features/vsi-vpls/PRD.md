# PRD

## Problema

O inventario atual de L2 mostra circuitos e entradas VSI/VPLS, mas nao consolida a biblioteca por tenant e VS-ID com status, membros, config e historico em um unico objeto operacional.

## Publico

- NOC.
- Engenharia de rede.
- Operacao read-only.
- Copilot interno.

## Casos de uso

- Identificar uma VSI/VPLS por tenant e VS-ID.
- Verificar divergencias de nome, VS-ID, VLAN e MTU.
- Diagnosticar PWs e ACs por dispositivo.
- Revisar config coletada sem acessar o device novamente.
- Consultar historico de estados e eventos.

## Requisitos

- Tenant isolation.
- Persistencia append-only para historico.
- Redaction de segredos.
- Parser testado com fixtures.
- UI consistente com o projeto.

## Nao objetivos

- Substituir o modulo atual de L2 Circuits.
- Criar editacao de rede.
- Executar comandos destrutivos.
