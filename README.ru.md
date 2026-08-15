# @iooe/ranobelib-sdk

Продакшен-ориентированный TypeScript SDK для чтения **публичных** данных RanobeLib через JSON API сети lib.social. Библиотека получает полные метаданные тайтла, оглавление, варианты перевода и содержимое глав, сохраняет форматирование и умеет надёжно синхронизировать книги на диск с возобновлением после остановки.

> API не является публично документированным контрактом RanobeLib. Используйте библиотеку только с разрешением владельца/правообладателей, соблюдайте ограничения сервера и держите интеграционные тесты включёнными.

## Возможности

- Node.js 20.12+ и строгий TypeScript, без runtime-зависимостей.
- Полные данные книги: ID, slug, русское/английское/оригинальное названия, алиасы, описание, обложки, возраст, страна, статусы, год, лицензия, рейтинг и число голосов, авторы, художники, команды, жанры, теги и счётчик глав.
- Полное оглавление одним запросом: том, строковый номер главы, включая `1.5`, название, ID и все ветки перевода.
- Информация о переводчиках: `branch_id`, команды, загрузивший пользователь и дата конкретной редакции.
- Содержимое главы: исходное поле `raw`, нормализованный безопасный HTML, обычный текст, вложения и SHA-256.
- Поддержка двух форматов RanobeLib: HTML и ProseMirror JSON.
- Сохранение абзацев, заголовков, жирного/курсива, ссылок, списков, цитат, кода, таблиц, разделителей и изображений.
- Даты главы: создание, публикация и истечение; лайки, модерация, статус просмотра и рейтинг качества перевода.
- Безопасный выбор перевода: ошибка при неоднозначности по умолчанию, `first`, `latest`, `oldest`, конкретный `branchId`, индекс либо callback.
- Общий rate limiter, ограничение параллельности, timeout, `Retry-After`, retry для `429`/`5xx`/сетевых ошибок и лимит размера ответа.
- Memory/File/Noop cache.
- Возобновляемая синхронизация на диск с атомарной записью, манифестом, пропуском неизменившихся глав и удалением исчезнувших.
- Каталог с пагинацией.
- CLI `ranobelib-sync`.

## Установка

```bash
npm install @iooe/ranobelib-sdk
```

До публикации в npm пакет можно установить из ветки или локального tarball:

```bash
npm install ./iooe-ranobelib-sdk-0.1.0.tgz
```

## Быстрый старт

```ts
import { FileCache, RanobeLibClient } from "@iooe/ranobelib-sdk";

const client = new RanobeLibClient({
  cache: new FileCache(".ranobelib-cache"),
  minRequestIntervalMs: 800,
  maxConcurrency: 4,
});

const url = "https://ranobelib.me/ru/book/91443--new-hero-in-dxd";

const info = await client.getFullTitleInfo(url);
console.log(info.title.names);
console.log(info.title.rating);
console.log(info.chapterCount, info.volumes.length);

const first = info.volumes[0]?.chapters[0];
if (first) {
  const chapter = await client.getChapter(url, first.volume, first.number, {
    branch: "first",
  });

  console.log(chapter.teams);
  console.log(chapter.dates);
  console.log(chapter.content.html);
  console.log(chapter.content.raw);
}
```

## Синхронизация всей книги

```ts
const result = await client.syncTitle(url, "./books/new-hero-in-dxd", {
  branch: "latest",
  concurrency: 4,
  writeRawJson: true,
  writeHtml: true,
  writeText: true,
  pruneRemoved: true,
  onProgress(progress) {
    console.log(progress.completed, progress.total, progress.current?.number);
  },
});

console.log(result.downloaded, result.skipped, result.failed);
```

Получается структура:

```text
books/new-hero-in-dxd/
├── title.json
├── chapters.json
├── manifest.json
└── chapters/
    └── v1/
        └── c1-187667/
            ├── chapter.json
            ├── chapter.html
            └── chapter.txt
```

Повторный запуск получает свежие метаданные и оглавление, но не скачивает неизменившиеся главы. Ключ редакции учитывает ID главы и метаданные веток; выбранная ветка также записана в манифесте.

## Выбор перевода

```ts
const variants = await client.getTranslations(url, "1", "1");

await client.getChapter(url, "1", "1", { branch: { branchId: 2251 } });
await client.getChapter(url, "1", "1", { branch: { translationIndex: 0 } });
await client.getChapter(url, "1", "1", { branch: "latest" });

await client.getChapter(url, "1", "1", {
  branch({ branches }) {
    return branches.find((branch) => branch.teams.some((team) => team.name === "Нужная команда")) ?? null;
  },
});
```

При нескольких вариантах и отсутствии выбора библиотека выбрасывает `AmbiguousTranslationError`, а не полагается на недокументированный дефолт API.

## Потоковая загрузка без удержания книги в памяти

```ts
for await (const chapter of client.streamTitle(url, { branch: "latest" })) {
  await saveToDatabase({
    sourceId: chapter.id,
    volume: chapter.volume,
    number: chapter.number,
    branchId: chapter.branchId,
    translators: chapter.teams,
    createdAt: chapter.dates.createdAt,
    publishAt: chapter.dates.publishAt,
    html: chapter.content.html,
    raw: chapter.content.raw,
    hash: chapter.content.sha256,
  });
}
```

## CLI

```bash
ranobelib-sync \
  "https://ranobelib.me/ru/book/91443--new-hero-in-dxd" \
  "./books/new-hero-in-dxd" \
  --branch=latest \
  --delay-ms=800 \
  --request-concurrency=4 \
  --sync-concurrency=4
```

## Разумные настройки для 900 глав

По умолчанию запросы начинают выполняться не чаще одного раза в 800 мс, то есть примерно 75 стартов в минуту, с четырьмя сетевыми слотами. Это не попытка обойти лимит: параллельность скрывает сетевую задержку, а общий scheduler всё равно выдерживает интервал. При официально согласованном лимите меняйте `minRequestIntervalMs` и `maxConcurrency` осознанно.

## Документация

- [API](docs/API.md)
- [Эксплуатация в продакшене](docs/PRODUCTION.md)
- [Английский README](README.md)
- [Политика безопасности](SECURITY.md)

## Правовой статус

Библиотека является техническим клиентом и не предоставляет права на тексты, переводы или изображения. Проверка разрешений, лицензий, атрибуции и условий хранения остаётся за оператором системы.
