# Badge on Raid

Статический browser source для OBS: показывает Twitch raid alert в CRT/glitch-стиле. Сборки и backend нет.

## Основной сценарий

1. `src/index.html` загружает зависимости в порядке: `config.js`, `auth.js`, `tmi.min.js`, `clips.js`, `script.js`.
2. `src/auth.js` проверяет user access token Twitch. Если токена нет, показывает простую панель Twitch Device Code Flow.
3. После авторизации `auth.js` вызывает callback из `script.js`, а основная логика подключается к Twitch-чату через `tmi.Client` на канал из `CHANNEL`.
4. При событии `raided` код сразу кладет базовые данные рейда (`username`, `viewers`) в `raidQueue`, чтобы сохранить порядок прихода рейдов.
5. Когда рейд доходит до показа, код пробует обогатить его через Helix API:
   - `users?login=...` для аватара и описания рейдера;
   - `streams?user_id=...` для названия стрима и категории, если рейдер онлайн;
   - `channels?broadcaster_id=...` как fallback для названия и категории канала.
6. Рейд показывается даже если Twitch API недоступен, чтобы alert не пропадал полностью.
7. `showRaid()` заполняет DOM, включает `.raid-wrapper.show`, печатает ник/название/категорию через `typeWriter()`, ждет `SHOW_TIME` и скрывает карточку.
8. После скрытия карточки, если `CLIPS_ENABLED = true`, код передает выбранный клип в `clips.js`.
9. Если данные стрима и канала не найдены, используются fallback-тексты из `config.js`.

У изменяемых CSS/JS-ресурсов в `index.html` может быть query-version вида `?v=...`: это простой cache-bust для браузера и OBS Browser Source.

## Клип рейдера

`src/clips.js` выбирает клип через Twitch Helix `clips`: запрашивается до `CLIP_FETCH_LIMIT` клипов рейдера за последние `CLIP_LOOKBACK_DAYS` дней, затем отбрасываются клипы длиннее `CLIP_MAX_DURATION_SECONDS`. Если среди оставшихся есть `is_featured=true`, берется самый свежий featured-клип по `created_at`. Если featured-клипов нет, берется клип с максимальным `view_count`.

`src/clips.js` воспроизводит клип через обычный HTML `<video>` внутри `.clip-frame`. Основной resolver идет в Twitch GraphQL `ClipsDownloadButton` и выбирает direct URL из `videoQualities[].sourceURL`; по умолчанию берется лучшее доступное качество. Если GraphQL не вернул URL или direct video не загрузился, единственный fallback - `https://twitch.so/pclipsmid/{slug}`.

Звук запрашивается сразу: `video.muted = false`, `volume = 1`, `autoplay = true`, `playsInline = true`. В обычном браузере autoplay со звуком может быть заблокирован политикой браузера; тогда overlay включает native controls на самом `<video>` и пишет предупреждение в консоль. В OBS Browser Source ожидаемый путь - автозапуск `<video>` со звуком без iframe-ограничений Twitch embed.

Блок клипа сверстан вокруг 16:9-области `.clip-frame`; высота wrapper складывается из header, video frame и meta-панели. Завершение показа идет по событию `ended` у `<video>` плюс небольшой буфер. Если событие не пришло, используется timeout от длительности клипа.

## Что за что отвечает

- `src/index.html` - разметка виджета для OBS: карточка рейда, аватар, ник, название стрима, категория, счетчик зрителей.
- `src/auth.js` - Twitch Device Code Flow, refresh token, кеширование token в `localStorage`, auth UI, Helix-запросы через `fetchTwitchAPI()`.
- `src/clips.js` - выбор клипа рейдера через Helix, получение direct video URL через Twitch GraphQL, HTML `<video>` playback и fallback на `twitch.so/pclipsmid/{slug}`.
- `src/script.js` - основная runtime-логика: подключение к Twitch-чату, обработка рейдов, очередь, показ и скрытие карточки рейда.
- `src/config.js` - публичные настройки: Twitch `CLIENT_ID`, канал, длительность показа, тестовый режим, fallback-тексты для оффлайн-рейда.
- `src/tmi.min.js` - vendored-библиотека TMI.js для подключения к Twitch-чату.
- `src/css/style.css` - layout и визуальный стиль карточки: размеры, цвета, позиционирование, состояние `.show`, типографика.
- `src/css/animations.css` - keyframes и utility-классы для flicker, scanlines, glitch, glow, cursor.
- `src/images/hello-raiders.avif` - картинка в заголовке карточки.
- `backup/` - старые версии и эксперименты, не участвуют в текущем запуске.

## Настройки

- `CHANNEL` - Twitch-канал, где слушается событие рейда.
- `CLIENT_ID` - публичный Twitch application client ID. `CLIENT_SECRET` в проекте больше не используется.
- `SHOW_TIME` - сколько миллисекунд карточка остается на экране.
- `TEST_MODE` - включает тестовый рейд при загрузке страницы.
- `TEST_SHOW_TIME` - длительность показа в тестовом режиме.
- `STREAM_TITLE_IF_EMPTY` и `STREAM_CATEGORY_IF_EMPTY` - тексты, если у рейдера нет активного стрима.
- `CLIPS_ENABLED` - включает показ клипа после карточки рейда.
- `CLIP_FETCH_LIMIT`, `CLIP_LOOKBACK_DAYS`, `CLIP_MAX_DURATION_SECONDS` - параметры выборки клипа.

## Запуск

1. Указать `CLIENT_ID` и нужный `CHANNEL` в `src/config.js`.
2. Для проверки включить `TEST_MODE = true`; для реального использования вернуть `false`.
3. Открыть overlay через выбранный локальный или внешний HTTP-сервер.
4. При первом запуске нажать `Подключить Twitch`, открыть Twitch Activate URL и ввести код.

Twitch token сохраняется в `localStorage` OBS/browser source. Если token протух или авторизация сбилась, overlay снова покажет панель авторизации. `CLIENT_SECRET` не нужен и не должен храниться в проекте.

В Twitch Developer Console для этого flow приложение должно быть public client. В `config.js` переносится только публичный Client ID.

## Тест рейда через URL

Можно запустить реальный сценарий рейда без ожидания Twitch-события:

```text
http://localhost:8765/index.html?test_channel=fra3a
```

`test_channel` - Twitch login канала, который надо считать рейдером. Код сам получит аватар, стрим/канал и клип через Twitch API. Можно также указать `test_viewers`, например:

```text
http://localhost:8765/index.html?test_channel=fra3a&test_viewers=42
```

Для отладки только клипа без показа raid-карточки добавь `test_clip_only=1`:

```text
http://localhost:8765/index.html?test_channel=fra3a&test_clip_only=1
```

Локальный сервер в проекте больше не зафиксирован: можно использовать любой удобный способ раздачи `src/` по HTTP или внешний хостинг.
