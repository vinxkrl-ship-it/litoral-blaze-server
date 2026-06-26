# 🔥 LITORAL BLAZE 14X — Deploy Completo

## Stack
- **Frontend:** React + Vite → Vercel (grátis)
- **Banco + Auth:** Supabase (grátis)
- **Rodadas:** Edge Function no Supabase faz scraping do bestblaze.com.br
- **Realtime:** Supabase Realtime (WebSocket automático)

---

## PASSO 1 — Criar projeto no Supabase

1. Acesse **supabase.com** → "New Project"
2. Dê um nome (ex: `litoral-blaze`), escolha uma senha e região (South America)
3. Aguarde ~2 min criando
4. Vá em **SQL Editor** → cole todo o conteúdo de `supabase/schema.sql` → clique **Run**
5. Vá em **Settings → API** e copie:
   - `Project URL` → é o `VITE_SUPABASE_URL`
   - `anon public key` → é o `VITE_SUPABASE_ANON_KEY`

---

## PASSO 2 — Deploy da Edge Function (scraping das rodadas)

1. Instale o Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Faça login:
   ```bash
   supabase login
   ```
3. Na pasta do projeto:
   ```bash
   supabase link --project-ref SEU_PROJECT_REF
   supabase functions deploy get-rounds
   ```
   > O `SEU_PROJECT_REF` está na URL do seu projeto Supabase (ex: `abcdefghijklmn`)

---

## PASSO 3 — Deploy no Vercel

1. Acesse **vercel.com** → "New Project"
2. Conecte seu GitHub e suba a pasta `litoral-blaze` (ou faça upload direto)
3. Na tela de configuração, adicione as variáveis de ambiente:
   ```
   VITE_SUPABASE_URL     = https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY = sua_anon_key_aqui
   VITE_ADMIN_PASS        = sua_senha_admin_aqui
   ```
4. Clique **Deploy** — em 2 minutos seu app está no ar!

---

## PASSO 4 — Testar

- Acesse a URL gerada pelo Vercel
- Clique em "Cadastrar" → crie uma conta
- Faça login como admin: clique "Acesso Admin" → use a senha que definiu em `VITE_ADMIN_PASS`
- No painel admin, aprove o pagamento de um usuário clicando no ✅

---

## Estrutura do Projeto

```
litoral-blaze/
├── src/
│   ├── components/
│   │   ├── LoginPage.jsx      # Tela de login + cadastro + pagamento
│   │   ├── UserApp.jsx        # App principal do usuário
│   │   ├── AdminApp.jsx       # Painel do admin
│   │   └── Toast.jsx          # Notificações
│   ├── hooks/
│   │   ├── useAuth.js         # Autenticação via Supabase
│   │   ├── useRounds.js       # Rodadas em tempo real
│   │   └── useSignals.js      # Sinais com realtime
│   ├── lib/
│   │   ├── supabase.js        # Client Supabase
│   │   └── ai.js              # IA dos 5 pilares
│   ├── App.jsx                # Roteamento principal
│   ├── main.jsx               # Entry point
│   └── index.css              # Todos os estilos
├── supabase/
│   ├── functions/
│   │   └── get-rounds/
│   │       └── index.ts       # Edge Function (scraping bestblaze)
│   └── schema.sql             # SQL para criar as tabelas
├── public/
│   ├── logo.png               # Sua logo
│   └── manifest.json          # PWA manifest
├── index.html
├── vite.config.js
├── package.json
└── .env.example               # Modelo das variáveis de ambiente
```

---

## Como funciona o sistema de rodadas

1. O frontend chama `supabase.functions.invoke('get-rounds')` a cada 3 segundos
2. A Edge Function roda nos servidores do Supabase (sem CORS)
3. Ela faz scraping de `bestblaze.com.br/doubleRodadasDia`
4. Retorna as rodadas em JSON normalizado
5. O frontend detecta rodadas novas e atualiza a tela em tempo real

---

## Rodando localmente (para testar)

```bash
# 1. Instala dependências
npm install

# 2. Cria o .env
cp .env.example .env
# Edita o .env com suas keys do Supabase

# 3. Inicia o servidor de desenvolvimento
npm run dev
# Acesse http://localhost:5173
```
