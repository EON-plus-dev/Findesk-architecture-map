# Findesk: карта auth + office-user

Публічна read-only карта архітектури на базі dashboard
[Understand Anything](https://github.com/Egonex-AI/Understand-Anything). GitHub Pages
збирає dashboard із зафіксованого upstream commit і додає лише перевірений
санітизований граф. Репозиторій не містить вихідних текстів приватного проєкту.

## Зафіксовані джерела

- Приватний source snapshot: `EON-plus-dev/Findesk-prod` commit
  `e1390364ef861739de12ea9de30eb116ed95536e`.
- Scope: `auth/` і `office-user/`.
- Upstream dashboard: `Egonex-AI/Understand-Anything` commit
  `fe8c5bc591716aafd79b4765549328f08ef5a52e`.
- Артефакт: [`data/knowledge-graph.json`](./data/knowledge-graph.json) у рідній
  схемі Understand Anything v1: 1 488 вузлів, 3 010 зв’язків, 10 шарів і 12
  кроків tour; SHA-256
  `38ecb74fa29430028109042bb94140f01434aa05e4a3277f184a5076213eaa6e`.
- Pages base path: `/Findesk-architecture-map/`.

## Межа приватності

Публікуються тільки структурні метадані: відносні шляхи дозволеного scope,
назви й типи вузлів, короткі описи, зв’язки, шари та tour. Заборонені source
bodies, `knowledgeMeta.content`, Figma thumbnail URLs, абсолютні шляхи, приватні
URL/IP, credentials/tokens/secrets та шляхи tests/fixtures/env/uploads/dumps/
build/vendor. Dashboard працює як статичний сайт: без token gate, source preview,
API та optional runtime fetches.

Після штатної генерації один абсолютний контейнерний шлях у `languageNotes`
узагальнено до опису каталогу; структура, вузли, зв’язки й tour не змінювалися.

## Відтворюване збирання

Workflow [`.github/workflows/pages.yml`](./.github/workflows/pages.yml):

1. запускає локальні integrity/privacy тести;
2. checkout-ить точний upstream SHA;
3. застосовує [`patches/public-static-dashboard.patch`](./patches/public-static-dashboard.patch);
4. виконує `corepack enable` і `pnpm install --frozen-lockfile` за upstream lockfile;
5. копіює граф до `packages/dashboard/public/knowledge-graph.json` і запускає
   upstream `build:demo`.

На `pull_request` виконується тільки build. Deploy job дозволений лише для push
до `main`; локальні зміни самі по собі нічого не розгортають.

Локальна перевірка графа:

```bash
npm test
npm run validate:graph
```
