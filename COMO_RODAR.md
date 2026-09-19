# OMR·Pro — Como Rodar Localmente no Windows

## PRE-REQUISITOS (instale antes de começar)

### 1. Git para Windows
- Baixe em: https://git-scm.com/download/win
- Execute o instalador com todas as opções no padrão
- Após instalar, reinicie o computador (ou feche e reabra todos os terminais)

### 2. Docker Desktop
- Se ainda não tem: https://www.docker.com/products/docker-desktop
- Abra o Docker Desktop e aguarde a baleia ficar verde na bandeja do sistema

---

## PASSO 1 — Colocar os arquivos na pasta certa

Crie a pasta `C:\projetos\omrpro` e coloque todos os arquivos do projeto lá dentro.

A estrutura deve ficar exatamente assim:

```
C:\projetos\omrpro\
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Makefile
├── COMO_RODAR.md          ← este arquivo
├── backend\
│   ├── Dockerfile
│   ├── package.json
│   └── src\
│       ├── server.js
│       ├── db\
│       │   ├── logger.js
│       │   ├── pool.js
│       │   ├── redis.js
│       │   ├── migrate.js
│       │   └── seed.js
│       ├── middleware\
│       │   ├── auth.js
│       │   └── audit.js
│       ├── routes\
│       │   ├── auth.js
│       │   ├── cards.js
│       │   ├── classes.js
│       │   ├── exams.js
│       │   ├── omr.js
│       │   ├── questions.js
│       │   ├── reports.js
│       │   ├── schools.js
│       │   ├── students.js
│       │   └── subjects.js
│       ├── services\
│       │   ├── pdfService.js
│       │   └── qrService.js
│       └── workers\
│           └── index.js
├── frontend\
│   ├── Dockerfile
│   ├── index.html
│   ├── nginx-spa.conf
│   ├── package.json
│   ├── vite.config.js
│   └── src\
│       ├── main.jsx
│       ├── App.jsx
│       ├── components\
│       │   ├── AppShell.jsx
│       │   └── AnswerCardPreview.jsx
│       ├── context\
│       │   └── AuthContext.jsx
│       ├── hooks\
│       │   └── useOMR.js
│       ├── pages\
│       │   ├── ClassesPage.jsx
│       │   ├── DashboardPage.jsx
│       │   ├── ExamBuilderPage.jsx
│       │   ├── ExamDetailPage.jsx
│       │   ├── ExamListPage.jsx
│       │   ├── LoginPage.jsx
│       │   ├── OMRUploadPage.jsx
│       │   ├── ReportPage.jsx
│       │   ├── SchoolsPage.jsx
│       │   └── StudentsPage.jsx
│       └── services\
│           └── api.js
├── omr-service\
│   ├── Dockerfile
│   ├── requirements.txt
│   └── src\
│       ├── main.py
│       └── processors\
│           ├── layout_builder.py
│           └── omr_processor.py
├── database\
│   └── migrations\
│       └── 001_initial_schema.sql
└── docker\
    └── nginx.conf
```

---

## PASSO 2 — Criar o arquivo .env

Abra o **Git Bash** na pasta `C:\projetos\omrpro`:
- Clique com botão direito numa área vazia da pasta
- Escolha "Git Bash Here"

No Git Bash, execute:
```bash
cp .env.example .env
notepad .env
```

O Bloco de Notas vai abrir. **Não precisa mudar nada** — os valores já estão prontos para uso local. Apenas salve e feche.

Se quiser ver o conteúdo, o arquivo terá:
```
NODE_ENV=development
POSTGRES_PASSWORD=omrpro123local
JWT_SECRET=omrpro_chave_secreta_local_muito_longa_para_testes_2025_xyzabc123
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000
```

---

## PASSO 3 — Subir os containers

No Git Bash (dentro de `C:\projetos\omrpro`):

```bash
docker compose up -d
```

> Na **primeira vez** isso demora de 5 a 15 minutos — o Docker vai baixar Node.js,
> Python, PostgreSQL e Redis. Aguarde terminar. O cursor `$` voltará quando estiver pronto.

Para confirmar que está tudo rodando:
```bash
docker compose ps
```

Você deve ver 6 serviços com status **running**:
```
NAME                STATUS
omrpro_api          running
omrpro_frontend     running
omrpro_omr          running
omrpro_postgres     running (healthy)
omrpro_redis        running
omrpro_worker       running
```

---

## PASSO 4 — Criar o banco de dados

Execute os dois comandos abaixo, um de cada vez:

```bash
docker compose exec api node src/db/migrate.js
```
Aguarde aparecer: `Migrations concluidas`

```bash
docker compose exec api node src/db/seed.js
```
Aguarde aparecer:
```
=== SEED CONCLUIDO ===
  admin@escola.com  / Admin@2025
  prof@escola.com   / Prof@2025
  coord@escola.com  / Coord@2025
```

---

## PASSO 5 — Abrir no navegador

Acesse: **http://localhost:3000**

Login:
- Email: `admin@escola.com`
- Senha: `Admin@2025`

---

## USO DO DIA A DIA (do 2º dia em diante)

```bash
# Para ligar (com Docker Desktop aberto):
docker compose up -d

# Para desligar (dados ficam salvos):
docker compose stop
```

---

## VERIFICAR SE ESTÁ TUDO OK

Abra estes endereços no navegador — todos devem responder:

| URL | O que deve aparecer |
|-----|-------------------|
| http://localhost:3000 | Tela de login do OMR·Pro |
| http://localhost:4000/health | `{"status":"ok"}` |
| http://localhost:5001/health | `{"status":"ok"}` |
| http://localhost:5001/docs | Documentação da API OMR |

---

## SOLUÇÃO DE PROBLEMAS

### "Cannot connect to the Docker daemon"
O Docker Desktop não está aberto. Abra e aguarde a baleia ficar verde.

### Algum container com status "Exit" ou "Error"
```bash
# Ver o erro específico:
docker compose logs api
docker compose logs frontend
docker compose logs omr-service

# Tentar reconstruir:
docker compose up -d --build
```

### "port already in use" (porta ocupada)
Algum programa usa a porta 3000, 4000 ou 5432. Reinicie o computador e tente novamente.

### Banco vazio / seed deu erro
Execute novamente:
```bash
docker compose exec api node src/db/migrate.js
docker compose exec api node src/db/seed.js
```

### Apagar tudo e começar do zero
```bash
# APAGA TODOS OS DADOS DO BANCO
docker compose down -v
docker compose up -d
docker compose exec api node src/db/migrate.js
docker compose exec api node src/db/seed.js
```

---

## FUNCIONALIDADES PARA TESTAR

1. **Login** — http://localhost:3000 com admin@escola.com / Admin@2025
2. **Dashboard** — métricas e prova demo já criada pelo seed
3. **Provas** — veja a "Matematica - Bimestral Demo" na lista
4. **Nova Prova** — clique em "+ Nova Prova", adicione questões, publique
5. **Alunos** — 15 alunos já cadastrados na turma 3EM A
6. **Turmas** — 4 turmas criadas: 3EM A, 3EM B, 2EM A, 9A
7. **Gerar PDF** — na prova demo, clique "Gerar PDF" para ver o cartão-resposta
8. **OMR Upload** — na prova publicada, clique "Iniciar OMR" para testar o upload

---

## DAR ACESSO AO CLAUDE PARA ATUALIZAR O CÓDIGO

### Opção mais simples
Crie um repositório no GitHub e me mande o link nas próximas conversas.

```bash
# No Git Bash dentro de C:\projetos\omrpro:
git init
git add .
git commit -m "OMR·Pro inicial"
# Crie o repo em github.com/new (nome: omrpro, privado, sem README)
git remote add origin https://github.com/SEU_USUARIO/omrpro.git
git branch -M main
git push -u origin main
```

### Aplicar atualizações
Quando o Claude gerar arquivos atualizados:
1. Substitua os arquivos na pasta correta
2. Execute `docker compose restart api` ou `docker compose restart frontend`
3. Salve no Git: `git add . && git commit -m "descricao" && git push`
