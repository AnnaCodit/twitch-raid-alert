# Badge on Raid

Статический browser source для OBS: показывает Twitch raid alert в CRT/glitch-стиле. Сборки и backend нет, OBS открывает `src/index.html` напрямую.

## Основной сценарий

1. `src/index.html` загружает зависимости в порядке: `secrets/secret.js`, `config.js`, `tmi.min.js`, `script.js`.
2. `src/script.js` подключается к Twitch-чату через `tmi.Client` на канал из `CHANNEL`.
3. При событии `raided` код сразу кладет базовые данные рейда (`username`, `viewers`) в `raidQueue`, чтобы сохранить порядок прихода рейдов.
4. Когда рейд доходит до показа, код пробует обогатить его через Helix API:
   - `users?login=...` для аватара и описания рейдера;
   - `streams?user_id=...` для названия стрима и категории, если рейдер онлайн;
   - `channels?broadcaster_id=...` как fallback для названия и категории канала.
5. Рейд показывается даже если Twitch API недоступен, чтобы alert не пропадал полностью.
6. `showRaid()` заполняет DOM, включает `.raid-wrapper.show`, печатает ник/название/категорию через `typeWriter()`, ждет `SHOW_TIME` и скрывает карточку.
7. Если данные стрима и канала не найдены, используются fallback-тексты из `config.js`.

## Что за что отвечает

- `src/index.html` - разметка виджета для OBS: карточка рейда, аватар, ник, название стрима, категория, счетчик зрителей.
- `src/script.js` - вся runtime-логика: подключение к Twitch, обработка рейдов, очередь, запросы Helix API с таймаутом, получение/кеширование токена в `localStorage`, fallback-показ и скрытие карточки.
- `src/config.js` - публичные настройки: канал, длительность показа, тестовый режим, fallback-тексты для оффлайн-рейда.
- `src/secrets/secret-example.js` - шаблон для Twitch credentials.
- `src/secrets/secret.js` - локальные `CLIENT_ID` и `CLIENT_SECRET`; файл нужен для запуска, но не должен попадать в публичный репозиторий.
- `src/tmi.min.js` - vendored-библиотека TMI.js для подключения к Twitch-чату.
- `src/css/style.css` - layout и визуальный стиль карточки: размеры, цвета, позиционирование, состояние `.show`, типографика.
- `src/css/animations.css` - keyframes и utility-классы для flicker, scanlines, glitch, glow, cursor.
- `src/images/hello-raiders.avif` - картинка в заголовке карточки.
- `backup/` - старые версии и эксперименты, не участвуют в текущем запуске.

## Настройки

- `CHANNEL` - Twitch-канал, где слушается событие рейда.
- `SHOW_TIME` - сколько миллисекунд карточка остается на экране.
- `TEST_MODE` - включает тестовый рейд при загрузке страницы.
- `TEST_SHOW_TIME` - длительность показа в тестовом режиме.
- `STREAM_TITLE_IF_EMPTY` и `STREAM_CATEGORY_IF_EMPTY` - тексты, если у рейдера нет активного стрима.

## Запуск

1. Скопировать `src/secrets/secret-example.js` в `src/secrets/secret.js` и заполнить Twitch credentials.
2. Указать нужный `CHANNEL` в `src/config.js`.
3. Для проверки включить `TEST_MODE = true`; для реального использования вернуть `false`.
4. Добавить `src/index.html` в OBS как Browser Source.
