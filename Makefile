up:
	docker compose up -d

stop:
	docker compose stop

down:
	docker compose down -v

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

migrate:
	docker compose exec api node src/db/migrate.js

seed:
	docker compose exec api node src/db/seed.js

psql:
	docker compose exec postgres psql -U omrpro_user -d omrpro

ps:
	docker compose ps

restart-api:
	docker compose restart api

restart-frontend:
	docker compose restart frontend
