# UX Baseline - 114-4WNET-NetOps

## Arquivos de layout encontrados

- `workspace/artifacts/netops-manager/src/App.tsx`
  - Define `QueryClientProvider`, `ThemeProvider`, `TooltipProvider`, `WouterRouter` e rotas.
- `workspace/artifacts/netops-manager/src/components/layout.tsx`
  - Define shell global: sidebar fixa, marca `NetOps Manager`, menu principal e area de conteudo.
- `workspace/artifacts/netops-manager/src/components/theme-provider.tsx`
  - Controla tema claro/escuro com `next-themes`.
- `workspace/artifacts/netops-manager/src/index.css`
  - Define tokens Tailwind/shadcn, dark mode, cores `background`, `sidebar`, `primary`, `muted`, `card`, `border`.
- `workspace/artifacts/netops-manager/src/components/ui/*`
  - Biblioteca shadcn/ui local usada por paginas existentes.

## Componentes que nao podem ser quebrados

- `Layout`
- `ThemeProvider`
- `Toaster`
- `TooltipProvider`
- Rotas existentes em `App.tsx`
- Componentes shadcn/ui em `components/ui`
- Tokens CSS em `index.css`
- Menu global existente em `layout.tsx`

## Rotas atuais

- `/` -> Dashboard
- `/devices` -> Devices
- `/devices/:id` -> Device detail
- `/compliance` -> Compliance
- `/provisioning` -> Provisioning
- `/templates` -> Templates
- `/policies` -> Policies
- `/config-collection` -> Config Collection
- `/snmp-history` -> SNMP History

## Padrao visual atual

- Tema padrao escuro, estilo NOC/cockpit.
- Sidebar fixa `w-64`, `bg-sidebar`, `border-sidebar-border`.
- Conteudo com `p-6`, `space-y-6`, cards shadcn e tabelas densas.
- Radius pequeno via `--radius: 0.25rem`.
- Destaque ativo usa `bg-sidebar-primary text-sidebar-primary-foreground`.
- Cores derivadas de tokens, nao de paleta hardcoded.

## Pontos seguros para extensao

- Criar novas paginas em `workspace/artifacts/netops-manager/src/pages`.
- Criar features isoladas em `workspace/artifacts/netops-manager/src/features`.
- Adicionar uma rota nova em `App.tsx`.
- Adicionar um item de menu em `layout.tsx` sem reescrever sidebar.
- Usar `Card`, `Badge`, `Table`, `Skeleton`, `Button`, `Tabs`, `Separator`.
- Usar `lucide-react` para icones discretos.

## Baseline apos discovery

- Device detail inclui bloco `Discovery` no overview.
- Botao de coleta SSH aguarda discovery assíncrono concluir antes de mostrar contadores e status.
- BGP panel mantem tabela densa e filtros existentes, mas busca peers no endpoint estruturado de discovery.
- A lista BGP respeita override local de papel, reaplica o valor salvo mesmo no fallback SNMP e trata peers VRF-aware como registros distintos.
- Modal de peer mantem desenho escuro redesenhado e adiciona source/confidence/evidence curta.
- Discovery panel mostra status persistido, fontes SSH/SNMP/cache, data do ultimo run e contadores de interfaces, peers, VRFs, L2VPN e policies.
- Quando nao ha snapshot persistido, BGP mostra empty state pedindo discovery em vez de tentar interpretar CLI.

## Baseline v0.2.8 compliance grouping

- `/compliance` mantem layout atual, RBAC de execucao e fluxo read-only para findings.
- Findings podem alternar entre lista detalhada e grupos agregados por regra/contexto/severidade/categoria.
- Grupos usam cards compactos, tabela densa e drawer lateral; evidencias exibidas continuam sanitizadas e individuais.
- Labels de categoria operacional devem aparecer em portugues, preservando os codigos no contrato de API.

## Baseline v0.2.9 freshness

- `/compliance` mostra por padrao somente o ultimo job por device.
- Historico continua acessivel por toggle explicito `Incluir histórico`.
- Findings exibem badge de freshness: Atual, Stale, Legado ou Substituído.
- Alertas de stale/legacy devem informar que dados antigos nao foram apagados.

## Baseline D3 BGP peer drilldown

- `/bgp/peer-drilldown` segue layout NOC existente: sidebar global, pagina `p-6`, cards/tabelas shadcn e badges compactos.
- Entrada de menu `BGP Drilldown` adicionada sem mudar estrutura da sidebar.
- Tela e read-only e snapshot-only: nao executa SSH, SNMP, discovery, NetBox ou consultas de rotas.
- Route tables aparecem desabilitadas como `not requested`.
