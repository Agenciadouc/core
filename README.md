# Painel de Performance

Painel de performance para clientes da Agência DROS. Consolida métricas de Meta Ads, Google Ads e Kiwify em um único dashboard, com gráficos e qualificação de leads.

**Repo:** https://github.com/soaresjoaoluiz1/core
**URL produção:** https://drosagencia.com.br/core

## Stack

- **Backend:** Node 16 + Express 5 + SQLite (better-sqlite3) + JWT
- **Frontend:** React 19 + Vite 6 + TypeScript (base path `/core/`)
- **Integrações:** Meta Marketing API, Google Ads API, Kiwify

## Rodar local

```bash
cd client-dashboard
npm install
cp .env.example .env       # preencher chaves Meta/Google/Kiwify
npm run dev                # sobe backend + frontend juntos
```

Backend escuta em `http://localhost:3004`. Frontend em `http://localhost:5173/core/` (Vite).

## Build de produção (frontend)

O bundle do frontend é **buildado localmente** e commitado em `dist/` — a VPS nunca roda `npm run build`. Antes de fazer deploy de mudança no frontend:

```bash
cd client-dashboard
npm run build               # gera dist/
git add dist/
git commit -m "feat(client-dashboard): ..."
git push core master
```

## Login padrão

- Email: `admin@drosagencia.com.br`
- Senha: `dros2026`

## Deploy

Ver [DEPLOY.md](DEPLOY.md) — caminho na VPS, processo PM2, comandos por tipo de mudança.
