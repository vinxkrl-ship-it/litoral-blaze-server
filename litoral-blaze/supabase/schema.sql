-- ================================================================
--  LITORAL BLAZE 14X — SCHEMA SUPABASE
--  Execute este SQL no SQL Editor do Supabase
-- ================================================================

-- 1. TABELA PROFILES (dados extras do usuário)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  email       TEXT,
  status      TEXT DEFAULT 'free' CHECK (status IN ('free','active','banned')),
  role        TEXT DEFAULT 'user'  CHECK (role IN ('user','admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

-- Cria perfil automaticamente quando usuário se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. TABELA SIGNALS
CREATE TABLE IF NOT EXISTS public.signals (
  id          BIGSERIAL PRIMARY KEY,
  time_str    TEXT NOT NULL,
  protection  INTEGER DEFAULT 6,
  confidence  INTEGER DEFAULT 85,
  pillars     INTEGER DEFAULT 0,
  note        TEXT DEFAULT '',
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','pending','win','loss','expired')),
  is_ai       BOOLEAN DEFAULT FALSE,
  result_time TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA SETTINGS
CREATE TABLE IF NOT EXISTS public.settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Configurações padrão
INSERT INTO public.settings (key, value) VALUES ('ai_enabled', 'true')
  ON CONFLICT (key) DO NOTHING;

-- 4. ROW LEVEL SECURITY

-- Profiles: usuário vê só o próprio, admin vê todos
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admin lê todos os perfis"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admin atualiza qualquer perfil"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Signals: todos leem, qualquer autenticado cria/atualiza
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leem sinais"
  ON public.signals FOR SELECT
  USING (true);

CREATE POLICY "Autenticado cria sinal"
  ON public.signals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Autenticado atualiza sinal"
  ON public.signals FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Autenticado deleta sinal"
  ON public.signals FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Settings: todos leem
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leem settings"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Autenticado atualiza settings"
  ON public.settings FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Autenticado insere settings"
  ON public.settings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5. REALTIME — habilita para todas as tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;

-- ================================================================
--  PRONTO! Agora configure as variáveis de ambiente no Vercel:
--  VITE_SUPABASE_URL = https://SEU_PROJETO.supabase.co
--  VITE_SUPABASE_ANON_KEY = sua_anon_key
--  VITE_ADMIN_PASS = sua_senha_admin
-- ================================================================
