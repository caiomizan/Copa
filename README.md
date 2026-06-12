# ⚽ Copa 2026 — Bolão

Aplicação web para acompanhar jogos e gerenciar um bolão da Copa do Mundo 2026.
Permite registrar resultados, calcular classificação por grupo e competir com amigos via palpites.

---

## Estrutura de pastas

```
Copa/
├── dados/
│   └── Copa 2026 - Rodada 01.csv   → placar e informações dos jogos (importado para o Firestore na primeira execução)
├── public/
│   └── index.html                   → interface web (SPA)
├── .env                             → variáveis de ambiente locais (não vai pro git)
├── .gitignore
├── baixar-dados.ps1                 → script para baixar backup do servidor Render
├── iniciar.bat                      → atalho para rodar localmente no Windows
├── package.json
├── render.yaml                      → configuração de deploy no Render
└── server.js                        → servidor Node.js (API + autenticação)
```

---

## Rodando localmente

### Pré-requisitos
- [Node.js 18+](https://nodejs.org)
- Projeto no Firebase com Firestore habilitado (ver seção abaixo)

### 1. Configurar o `.env`

Crie o arquivo `.env` na raiz com o seguinte conteúdo:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=sua_senha_aqui
SESSION_SECRET=qualquer_string_aleatoria
FIREBASE_SERVICE_ACCOUNT=<base64 do serviceAccountKey.json>
```

> O servidor cria o usuário admin automaticamente na primeira inicialização
> com base nessas variáveis.

Para gerar o valor de `FIREBASE_SERVICE_ACCOUNT`, veja a seção [Firebase](#firebase).

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

## Firebase

O app usa o [Firebase Firestore](https://firebase.google.com) para armazenar usuários, palpites e rodadas.

### Criar o projeto Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um novo projeto
2. No menu lateral, vá em **Firestore Database → Criar banco de dados**
3. Escolha o modo **Produção** e a região mais próxima (ex: `southamerica-east1`)
4. Vá em **Configurações do projeto → Contas de serviço**
5. Clique em **Gerar nova chave privada** e salve o arquivo `serviceAccountKey.json`

### Gerar a variável `FIREBASE_SERVICE_ACCOUNT`

O arquivo JSON é codificado em base64 para evitar problemas com quebras de linha em variáveis de ambiente.

**PowerShell (Windows):**
```powershell
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("serviceAccountKey.json")) | clip
```

Cole o resultado no `.env` como valor de `FIREBASE_SERVICE_ACCOUNT`.

### Coleções criadas automaticamente

| Coleção | Conteúdo |
|---------|----------|
| `usuarios` | Contas dos jogadores |
| `palpites` | Um documento por jogador com todos os seus palpites |
| `rodadas` | Arquivos CSV das rodadas (importados automaticamente do `dados/` na primeira execução) |

---

## Como usar

### Perfil administrador

O admin é o responsável por cadastrar os outros jogadores e registrar os resultados.

**Primeiro acesso:**
1. Acesse a URL do app
2. Faça login com as credenciais definidas no `.env`

**Cadastrar jogadores:**
1. Clique em **👥 Usuários** no topo da página
2. Preencha o usuário e uma senha provisória
3. Informe as credenciais ao amigo (WhatsApp, etc.)
4. O jogador pode alterar a própria senha depois em **🔑 Senha**

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

> **Atenção:** os palpites travam automaticamente no horário de início de cada jogo (horário de Brasília).
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
5. Adicione as variáveis de ambiente no painel do Render (**Environment**):

| Variável | Valor |
|----------|-------|
| `ADMIN_USERNAME` | nome do usuário admin (ex: `admin`) |
| `ADMIN_PASSWORD` | senha forte do admin |
| `FIREBASE_SERVICE_ACCOUNT` | base64 do `serviceAccountKey.json` |

> `SESSION_SECRET` é gerado automaticamente pelo `render.yaml`.

6. Clique em **Deploy**

Após o deploy, o Render fornece uma URL pública para compartilhar com os amigos.

> **Plano gratuito:** o servidor hiberna após 15 minutos sem acesso. O primeiro acesso
> após a hibernação pode demorar ~30 segundos. Os dados persistem no Firestore
> independentemente de hibernações ou redeploys.

### 3. Baixar backup dos dados

Use o script PowerShell para baixar uma cópia local dos dados do servidor:

```powershell
.\baixar-dados.ps1 -Servidor https://copa-2026.onrender.com
```

O script lê as credenciais do `.env` local, faz login no servidor e salva
`users.json` e `palpites.json` na pasta `dados/`.

---

## API resumida

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `GET` | `/api/auth/status` | Público | Verifica se há usuários cadastrados |
| `POST` | `/api/auth/login` | Público | Login |
| `POST` | `/api/auth/logout` | Logado | Logout |
| `GET` | `/api/auth/me` | Logado | Dados do usuário atual |
| `POST` | `/api/auth/change-password` | Logado | Altera a própria senha |
| `GET` | `/api/users` | Admin | Lista jogadores |
| `POST` | `/api/users` | Admin | Cria jogador |
| `DELETE` | `/api/users/:username` | Admin | Remove jogador |
| `POST` | `/api/users/:username/reset-password` | Admin | Redefine senha de um jogador |
| `GET` | `/api/csv` | Logado | Retorna rodadas (CSV) do Firestore |
| `POST` | `/api/csv` | Admin | Salva/atualiza uma rodada |
| `GET` | `/api/palpites/me` | Logado | Palpites do usuário atual |
| `POST` | `/api/palpites` | Logado | Salva palpites |
| `GET` | `/api/palpites/all` | Logado | Todos os palpites |
| `GET` | `/api/bolao` | Logado | Classificação do bolão |
| `GET` | `/api/admin/dados/:file` | Admin | Download de `users.json` ou `palpites.json` |

---

## Tecnologias

- **Backend:** Node.js, Express, express-session, bcryptjs, dotenv
- **Frontend:** HTML + CSS + JavaScript puro (sem frameworks)
- **Banco de dados:** Firebase Firestore
- **Deploy:** Render (plano gratuito)
