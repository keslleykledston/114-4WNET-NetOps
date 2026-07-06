# Padrão de Layout NetOps

## Objetivo

Este documento define o layout base do `NetOps Manager` para evitar regressões visuais e manter consistência entre páginas.

## Fonte de verdade

O layout atual validado é a referência para novas telas:

- `workspace/artifacts/netops-manager/src/components/layout.tsx`
- `workspace/artifacts/netops-manager/src/App.tsx`
- `workspace/artifacts/netops-manager/src/pages/l2vpn-dashboard.tsx`

## O que virou padrão

### 1. Sidebar compacta e funcional

- Sidebar fixa à esquerda.
- Colapso manual com largura reduzida.
- Seções visuais por domínio:
  - Monitoring
  - Circuits
  - BGP
  - Connectivity
  - Policies
- Item ativo com destaque sutil, sem explosão de cor.
- Área de usuário, idioma, tema e logout no rodapé da sidebar.

### 2. Canvas principal escuro

- Fundo escuro em gradiente.
- Uso de brilho leve, radial e grid pontilhado.
- Conteúdo em blocos com glass effect discreto.
- Sem troca de tema global ou alteração de tokens do design system.

### 3. Cards premium

- Cards com:
  - borda translúcida
  - blur leve
  - sombra profunda e controlada
  - hover suave
- Preferir cards para blocos operacionais, não para excesso de conteúdo fragmentado.

### 4. Hierarquia visual curta

- Título principal curto.
- Subtítulo explicando o estado operacional.
- Cards no topo com métricas.
- Gráficos ou tabelas logo abaixo.
- Ações de edição sempre mais abaixo que a leitura.

### 5. Layout orientado a operação

- Páginas devem responder rápido ao olho do NOC.
- A primeira dobra precisa mostrar:
  - status
  - volume
  - alerta
  - próxima ação
- Formulários longos devem ser quebrados em blocos curtos.

## Padrão da página L2VPN

A página `/provisioning` virou referência do novo padrão L2VPN:

- hero compacto
- cards de status
- comparação de circuitos
- draft supervisionado
- gráficos de resumo
- lista de circuitos com seleção rápida

Essa página é o modelo visual para telas futuras de L2VPN.

## Regras para evitar retrocesso

- Não reintroduzir sidebar antiga ou hierarquia pesada.
- Não voltar a layout claro/generic dashboard.
- Não usar cards grandes sem função.
- Não colocar fluxo de criação acima do fluxo de leitura.
- Não misturar paginação visual com menus secundários na lateral global.
- Não esconder contexto operacional atrás de modais desnecessários.
- Não mudar estrutura global sem motivo funcional.

## Aplicação prática

Ao criar ou alterar páginas:

1. Preservar a sidebar atual.
2. Manter o canvas principal escuro.
3. Usar cards premium com densidade moderada.
4. Mostrar status operacional primeiro.
5. Deixar edição como ação secundária.
6. Usar a página L2VPN como referência para dashboards novos.

## Relação com os guardrails

Este documento complementa:

- `docs/frontend/UX_GUARDRAILS.md`

Se houver conflito, este padrão deve ser tratado como referência visual operacional para as páginas novas do núcleo NetOps.
