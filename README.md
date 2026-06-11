# ⚽ Copa 2026 — Bolão

Aplicação web para acompanhar jogos e gerenciar um bolão da Copa do Mundo 2026.
Permite registrar resultados, calcular classificação por grupo e competir com amigos via palpites.

---

## Estrutura de pastas

```
Copa/
├── dados/
│   ├── Copa 2026 - Rodada 01.csv   → placar e informações dos jogos
│   ├── users.json                   → contas dos jogadores (criado automaticamente)
│   └── palpites.json                → palpites salvos (criado automaticamente)
├── public/
│   └── index.html                   → interface web (SPA)
├── .env                             → variáveis de ambiente locais (não vai pro git)
├── .gitignore
├── iniciar.bat                      → atalho para rodar localmente no Windows
├── package.json
├── render.yaml                      → configuração de deploy no Render
└── server.js                        → servidor Node.js (API + autenticação)
```

---

## Rodando localmente

### Pré-requisito
- [Node.js 18+](https://nodejs.org)

### 1. Configurar o `.env`

O arquivo `.env` já existe na raiz do projeto com as credenciais do admin:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=hexa2026
SESSION_SECRET=copa2026local
```

> O servidor cria o usuário admin automaticamente na primeira inicialização
> com base nessas variáveis.

### 2. Instalar dependências (só na primeira vez)

```bash
npm install
```

### 3. Iniciar o servidor

**Windows:** dê duplo clique em `iniciar.bat`

**Terminal:**
```bash
node server.js
```

O servidor abre automaticamente em `http://127.0.0.1:3026`.

---

## Como usar

### Perfil administrador

O admin é o responsável por cadastrar os outros jogadores e registrar os resultados.

**Primeiro acesso:**
1. Acesse `http://127.0.0.1:3026`
2. Faça login com as credenciais do `.env` (`admin` / `hexa2026`)

**Cadastrar jogadores:**
1. Clique em **👥 Usuários** no topo da página
2. Preencha o usuário e uma senha provisória
3. Informe as credenciais ao amigo (WhatsApp, etc.)

**Registrar resultados:**
1. Vá na aba **Grupos**
2. Selecione o grupo pelo seletor (A, B, C…)
3. Preencha os placares nos campos de cada jogo
4. Clique em **💾 Salvar Resultados** ou pressione `Ctrl+S`

### Perfil jogador

**Entrar palpites:**
1. Faça login com o usuário criado pelo admin
2. Vá na aba **Bolão**
3. Preencha os palpites de cada jogo
4. Clique em **💾 Salvar Palpites** ou pressione `Ctrl+S`

> **Atenção:** os palpites travam automaticamente no horário de início de cada jogo.
> Salve antes do apito inicial.

### Pontuação do bolão

| Acerto | Pontos |
|--------|--------|
| Placar exato (ex: 2×1 certo) | **3 pts** |
| Resultado certo (vencedor ou empate) | **1 pt** |
| Errou | 0 pts |

A classificação é atualizada automaticamente conforme o admin registra os resultados.

---

## Deploy no Render (gratuito)

### 1. Criar repositório no GitHub

```bash
git init
git add .
git commit -m "Copa 2026 Bolão"
```

Crie um repositório no [GitHub](https://github.com/new) e faça o push:

```bash
git remote add origin https://github.com/SEU_USUARIO/copa-2026.git
git push -u origin main
```

### 2. Criar o serviço no Render

1. Acesse [render.com](https://render.com) e faça login
2. Clique em **New → Web Service**
3. Conecte o repositório GitHub
4. O Render detecta o `render.yaml` automaticamente — confirme as configurações
5. Adicione as variáveis de ambiente no painel do Render:

| Variável | Valor |
|----------|-------|
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | `hexa2026` (ou outra senha forte) |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | (gerado automaticamente pelo render.yaml) |

6. Clique em **Deploy**

Após o deploy, o Render fornece uma URL pública (ex: `https://copa-2026.onrender.com`) para compartilhar com os amigos.

> **Importante:** o plano gratuito do Render hiberna o servidor após 15 minutos
> sem acesso. O primeiro acesso após a hibernação pode demorar ~30 segundos.
> Os dados (palpites e usuários) persistem entre hibernações, mas são perdidos
> em caso de redeploy. **Evite fazer redeploy durante a Copa.**

---

## API resumida

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/auth/status` | Público | Verifica se há usuários cadastrados |
| `POST` | `/api/auth/login` | Público | Login |
| `POST` | `/api/auth/logout` | Logado | Logout |
| `GET` | `/api/auth/me` | Logado | Dados do usuário atual |
| `GET` | `/api/users` | Admin | Lista jogadores |
| `POST` | `/api/users` | Admin | Cria jogador |
| `DELETE` | `/api/users/:username` | Admin | Remove jogador |
| `GET` | `/api/csv` | Logado | Retorna dados dos jogos |
| `POST` | `/api/csv` | Admin | Salva resultados |
| `GET` | `/api/palpites/me` | Logado | Palpites do usuário atual |
| `POST` | `/api/palpites` | Logado | Salva palpites |
| `GET` | `/api/palpites/all` | Logado | Todos os palpites |
| `GET` | `/api/bolao` | Logado | Classificação do bolão |

---

## Tecnologias

- **Backend:** Node.js, Express, express-session, bcryptjs, dotenv
- **Frontend:** HTML + CSS + JavaScript puro (sem frameworks)
- **Dados:** arquivos CSV e JSON locais
- **Deploy:** Render (plano gratuito)
