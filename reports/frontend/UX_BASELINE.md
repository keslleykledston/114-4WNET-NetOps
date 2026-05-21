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
