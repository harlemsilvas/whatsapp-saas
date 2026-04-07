-- =========================
-- DATABASE STRUCTURE SaaS
-- =========================

-- Empresas (multi-tenant)
CREATE TABLE empresas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  whatsapp_token TEXT,
  phone_number_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contatos (clientes dos seus clientes)
CREATE TABLE contatos (
  id SERIAL PRIMARY KEY,
  empresa_id INT REFERENCES empresas(id) ON DELETE CASCADE,
  nome VARCHAR(255),
  telefone VARCHAR(20) NOT NULL,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mensagens
CREATE TABLE mensagens (
  id SERIAL PRIMARY KEY,
  empresa_id INT REFERENCES empresas(id) ON DELETE CASCADE,
  contato_id INT REFERENCES contatos(id) ON DELETE CASCADE,
  direcao VARCHAR(10), -- entrada | saida
  conteudo TEXT,
  tipo VARCHAR(20) DEFAULT 'text',
  lida_em TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fluxos automatizados
CREATE TABLE fluxos (
  id SERIAL PRIMARY KEY,
  empresa_id INT REFERENCES empresas(id) ON DELETE CASCADE,
  gatilho VARCHAR(100),
  resposta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logs de IA
CREATE TABLE ia_logs (
  id SERIAL PRIMARY KEY,
  empresa_id INT,
  pergunta TEXT,
  resposta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- USUÁRIO DA APLICAÇÃO
-- =========================

CREATE USER app_user WITH PASSWORD 'app123';

GRANT ALL PRIVILEGES ON DATABASE whatsapp_saas TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON SEQUENCES TO app_user;

-- =========================
-- DADOS INICIAIS
-- =========================

INSERT INTO empresas (nome, telefone)
VALUES ('Empresa Teste', '5511999999999');

INSERT INTO fluxos (empresa_id, gatilho, resposta)
VALUES (1, 'menu', '1 - Produtos\n2 - Suporte\n3 - Pedidos');