# Deploy — Painel de Performance

## Infra

- **VPS:** vps-5269157.3store.com.br (HostGator, root SSH)
- **OS:** CentOS 7 / TuxCare ELS
- **Node:** 16.x via nvm (`source ~/.nvm/nvm.sh && nvm use 16`)
- **Web server:** Apache 2.4 (cPanel) — proxy reverso pra porta 3004
- **Path:** `/root/core`
- **Processo PM2:** `dros-core`
- **Porta API:** 3004
- **Base path frontend:** `/core/`
- **URL:** https://drosagencia.com.br/core

## Estratégia de build

**Frontend é buildado LOCALMENTE** (igual ao Hub). A pasta `client-dashboard/dist/` vai commitada no repo. A VPS nunca roda `npm run build` no frontend. Quando muda algo no frontend:

1. No PC local: `cd client-dashboard && npm run build`
2. Commit incluindo `client-dashboard/dist/`
3. `git push core master`
4. Na VPS: `git pull && pm2 restart dros-core`

## Comandos por tipo de mudança

Todos começam com:
```bash
source ~/.nvm/nvm.sh && nvm use 16 && cd /root/core
```

### 1. Backend ou frontend (já buildado)
```bash
git pull && pm2 restart dros-core
```

### 2. Nova dependência npm
```bash
source /opt/rh/devtoolset-11/enable && git pull && cd client-dashboard && npm install && pm2 restart dros-core
```

### 3. Reset completo (deu pau no lock ou mudou versão de pacote)
```bash
source /opt/rh/devtoolset-11/enable && git pull && cd client-dashboard && rm -f package-lock.json && rm -rf node_modules && npm install && pm2 restart dros-core
```

## Variáveis de ambiente na VPS

Arquivo `/root/core/client-dashboard/.env`. Variáveis obrigatórias listadas em [.env.example](.env.example).

⚠ A maioria das integrações (Meta, Google Ads, Kiwify) **só funcionam com chaves reais** — em desenvolvimento dá pra rodar sem elas, mas as rotas relacionadas vão falhar.

## Compilar módulos nativos

`better-sqlite3` pode precisar compilar do zero se o prebuild não casar com a arquitetura da VPS. Nesse caso:
```bash
source /opt/rh/devtoolset-11/enable
cd client-dashboard && npm install
```

CentOS 7 vem com GCC 4.8, que não compila C++14/17. Devtoolset-11 dá GCC 11. Foi instalado uma vez via:
```bash
yum install centos-release-scl devtoolset-11-gcc devtoolset-11-gcc-c++ devtoolset-11-make
```

## Configuração do proxy reverso

Servidor usa **Apache/cPanel** (não nginx). O `ProxyPass` pra `/core/` precisa apontar pra `http://127.0.0.1:3004/`. Configuração em cPanel ou em `/etc/httpd/conf.d/`.

## Login padrão

- Email: `admin@drosagencia.com.br`
- Senha: `dros2026`

## Troubleshooting rápido

- **PM2 não responde:** `pm2 logs dros-core --lines 100`
- **502 no Apache:** processo Node morreu, `pm2 restart dros-core`
- **Bundle antigo:** esqueceu de buildar local antes do commit. Buildar e commitar `dist/`
- **Erro Meta/Google/Kiwify:** verificar tokens no `.env`. Refresh tokens podem expirar (Google Ads) — refazer fluxo OAuth
