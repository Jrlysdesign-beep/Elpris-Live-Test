# Elpris Live Test

Ny, selvstændig testløsning til flere Zaptec-brugere. Den gamle elpris-app og de gamle Workers ændres ikke.

## Status
- [x] Grundstruktur til Cloudflare Worker, minut-trigger og D1-datamodel
- [ ] Verificér Zaptec-live-målerstand, enhed og tidsstempel
- [ ] Sikker brugerlogin og fornyelse af Zaptec-adgang
- [ ] Automatisk minutopsamling med fejlhåndtering og sessionsregistrering
- [ ] Valideret fordeling på kvarterer og korrekt DK1/DK2-pris
- [ ] Ny brugerflade

**Ingen automatisk Zaptec-aflæsning er aktiv endnu.** Scheduled-handleren er kun et sikkert heartbeat.

## Opsætning
Før deployment skal `wrangler.toml` oprettes med den **korrekte** D1 database_id og binding `DB` for databasen `elpris-live-db`. Brug ikke en opdigtet database-ID. Kør derefter `schema.sql` på testdatabasen. Gem aldrig tokens eller passwords i GitHub.
