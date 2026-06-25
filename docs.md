# Badge on Raid

Статический browser source для OBS: показывает Twitch raid alert в CRT/glitch-стиле. Сборки и backend нет.

## Основной сценарий

1. `src/index.html` загружает зависимости в порядке: `config.js`, `tmi.min.js`, `script.js`.
2. `src/script.js` проверяет user access token Twitch. Если токена нет, показывает простую панель Twitch Device Code Flow.
3. После авторизации код подключается к Twitch-чату через `tmi.Client` на канал из `CHANNEL`.
4. При событии `raided` код сразу кладет базовые данные рейда (`username`, `viewers`) в `raidQueue`, чтобы сохранить порядок прихода рейдов.
5. Когда рейд доходит до показа, код пробует обогатить его через Helix API:
   - `users?login=...` для аватара и описания рейдера;
   - `streams?user_id=...` для названия стрима и категории, если рейдер онлайн;
   - `channels?broadcaster_id=...` как fallback для названия и категории канала.
6. Рейд показывается даже если Twitch API недоступен, чтобы alert не пропадал полностью.
7. `showRaid()` заполняет DOM, включает `.raid-wrapper.show`, печатает ник/название/категорию через `typeWriter()`, ждет `SHOW_TIME` и скрывает карточку.
8. После скрытия карточки, если `CLIPS_ENABLED = true`, код показывает клип рейдера в нижней трети экрана.
9. Если данные стрима и канала не найдены, используются fallback-тексты из `config.js`.

У изменяемых CSS/JS-ресурсов в `index.html` может быть query-version вида `?v=...`: это простой cache-bust для браузера и OBS Browser Source.

## Клип рейдера

Клип выбирается через Twitch Helix `clips`: запрашивается до `CLIP_FETCH_LIMIT` клипов рейдера за последние `CLIP_LOOKBACK_DAYS` дней, затем отбрасываются клипы длиннее `CLIP_MAX_DURATION_SECONDS`. Если среди оставшихся есть `is_featured=true`, берется самый свежий featured-клип по `created_at`. Если featured-клипов нет, берется клип с максимальным `view_count`.

Показ идет через официальный Twitch clips iframe `clips.twitch.tv/embed`. Прямой HTML `<video>` не используется: Twitch Helix не отдает стабильный официальный MP4 URL для клипа.

Блок клипа сверстан вокруг настоящей 16:9-области `.clip-frame`; высота wrapper не фиксируется вручную, а складывается из header, 16:9-окна и meta-панели. Twitch iframe создается только на время показа клипа внутри `.clip-frame`. Для autoplay важно, чтобы ancestor-цепочка iframe не получала transform-анимации и чтобы meta-панель не была дочерним элементом `.clip-terminal`: Twitch embed учитывает видимость, размер и перекрытие плеера при проверке autoplay.

Длительность показа клипа считается по `clip.duration` из Helix: фактическая длительность клипа плюс `CLIP_END_BUFFER_MS`. Отсчет начинается после события `load` у Twitch iframe; если iframe не отдал `load`, отсчет стартует после fallback-таймаута `CLIP_IFRAME_LOAD_TIMEOUT_MS`. Официальный clips iframe Twitch не поддерживает interactive Player API, поэтому надежного события старта или окончания именно видео из iframe нет. Если `duration` не пришла или некорректна, используется fallback `CLIP_SHOW_TIME`.

Для autoplay со звуком браузеру нужна пользовательская активация домена. Если клипы включены и `CLIP_IFRAME_MUTED = false`, overlay показывает панель `Clip sound unlock` и не запускает chat/test-триггеры, пока звук не подготовлен. В OBS перед стримом открой Browser Source через `Interact` и один раз нажми `Включить звук клипов`; это дает странице user activation, которую top frame делегирует Twitch iframe через `allow="autoplay"`. Без такого клика браузер/OBS может принудительно запустить Twitch clip muted.

Для клипов с заполненными `video_id` и `vod_offset` overlay использует официальный Twitch Player API и воспроизводит соответствующий VOD с нужного offset, скрывая его через `clip.duration`. Это позволяет вызвать `setMuted(false)` и `setVolume(CLIP_PLAYER_VOLUME)`. Если VOD player стартует с места, похожего на конец клипа, используется `CLIP_VOD_OFFSET_MODE = "end"`: старт считается как `vod_offset - duration`. Если у клипа нет VOD offset или Twitch Player API не загрузился, используется прежний clips iframe fallback.

Для максимально надежного iframe fallback лучше открывать overlay в OBS через локальный HTTP-адрес, например `http://localhost:8765/index.html`, а не напрямую как `file://.../src/index.html`: Twitch embed требует корректный `parent` domain.

## Что за что отвечает

- `src/index.html` - разметка виджета для OBS: карточка рейда, аватар, ник, название стрима, категория, счетчик зрителей.
- `src/script.js` - вся runtime-логика: Twitch Device Code Flow, refresh token, подключение к Twitch-чату, обработка рейдов, очередь, запросы Helix API с таймаутом, выбор клипа рейдера, кеширование token в `localStorage`, показ и скрытие карточки.
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
- `CLIP_SHOW_TIME` - fallback-длительность показа клипа, если Twitch не вернул `duration`.
- `CLIP_END_BUFFER_MS` - запас после `clip.duration`, чтобы iframe успел догрузиться и не исчезал слишком рано.
- `CLIP_IFRAME_LOAD_TIMEOUT_MS` - сколько максимум ждать событие `load` от Twitch iframe перед стартом отсчета длительности.
- `CLIP_IFRAME_MUTED` - включает mute для Twitch iframe. Значение `false` запрашивает клип со звуком, но обычный браузер может заблокировать autoplay со звуком до пользовательского жеста; OBS Browser Source обычно ведет себя мягче.
- `CLIP_USE_VOD_PLAYER_IF_AVAILABLE` - включает VOD-player режим для клипов с `video_id` и `vod_offset`, чтобы можно было программно выставить звук.
- `CLIP_PLAYER_VOLUME` - громкость для Twitch Player API в VOD-player режиме, от `0` до `1`.
- `CLIP_VOD_OFFSET_MODE` - как трактовать `vod_offset` для VOD-player режима: `"start"` использует offset как начало, `"end"` стартует с `vod_offset - duration`.

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
