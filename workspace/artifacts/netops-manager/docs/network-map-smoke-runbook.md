# Network Map Smoke Runbook

## 1. Pré-requisitos

- `pnpm` instalado.
- Dependências do workspace já instaladas.
- API local disponível em `http://127.0.0.1:8085`.
- Credenciais de admin no `.env` carregado no host.

## 2. Instalação

```bash
pnpm install
```

## 3. Subir Frontend

```bash
PORT=3000 BASE_PATH=/ pnpm -C workspace/artifacts/netops-manager dev
```

## 4. URL Esperada

- Frontend: `http://localhost:3000/`
- API proxy: `http://localhost:3000/api/*`

## 5. Rota Do Mapa

- App usa rota `"/map"`.
- Se ambiente externo expõe alias para `/network-map`, usar essa rota apenas se já estiver roteada.

## 6. Entrar Em Modo Edição

- Abrir menu do mapa.
- Clicar em `Edição`.

## 7. Passos Mínimos Do Smoke

1. Abrir mapa.
2. Alternar visualização/edição.
3. Criar link manual.
4. Criar link planejado.
5. Mover device conectado.
6. Selecionar link.
7. Editar link.
8. Remover link.
9. Remover device conectado.
10. Salvar layout.
11. Recarregar página.
12. Validar persistência visual.
13. Zoom in.
14. Zoom out.
15. Pan.
16. Repetir drag com zoom diferente de 100%.
17. Validar minimap.
18. Validar painel lateral.
19. Validar filtros.
20. Validar modal de link.
21. Validar ausência de handles no modo visualização.

## 8. Como Preencher PASS/FAIL/BLOCKED

- `PASS`: passo executado e resultado bateu.
- `FAIL`: passo executado e comportamento quebrou.
- `NOT_TESTED`: passo não chegou a ser executado.
- `BLOCKED`: passo não pôde ser executado por dependência externa ou falta de acesso.

## 9. Coleta De Evidência

- Screenshot da página em cada marco importante.
- Nota curta com horário, ação e resultado.
- Se possível, anexar vídeo ou trace do navegador.

## 10. Parar Servidor

- Interromper processo do `pnpm -C workspace/artifacts/netops-manager dev` com `Ctrl+C`.

## Observação Operacional

- O mapa vive em `/map`.
- Em smoke automatizado, é preciso sessão autenticada para acessar a rota.
- Se o browser não conseguir reaproveitar cookie/sessão, registrar como `BLOCKED` e não forçar conclusão manual.
