# Badge on Raid

Статический raid alert для OBS в CRT/glitch-стиле: показывает карточку рейдера, данные канала и, если включено, короткий клип рейдера через обычный HTML `<video>`.

Backend, сборка и обязательный localhost не нужны. Для обычного использования достаточно открыть `src/index.html` как локальный файл в OBS Browser Source.

## Быстрый запуск

1. Укажи `CLIENT_ID` и `CHANNEL` в `src/config.js`.
2. Проверь, что `TEST_MODE = false` для реального использования.
3. В OBS добавь `Browser Source`.
4. Включи `Local file` и выбери `src/index.html`.
5. При первом запуске нажми `Подключить Twitch` через режим interact, открой Twitch Activate URL в браузере (в обс он скорее всего не откроется) и разреши доступ.

Twitch token сохраняется в `localStorage` OBS/browser source. Если авторизация сбросится или token протухнет, overlay снова покажет панель подключения.

## Настройки

- `CLIENT_ID` - публичный Twitch application client ID.
- `CHANNEL` - канал, где overlay слушает событие рейда.
- `SHOW_TIME` - сколько миллисекунд показывать карточку рейда.
- `TEST_MODE` - включает тестовый рейд при загрузке страницы.
- `TEST_SHOW_TIME` - длительность показа в тестовом режиме.
- `CLIPS_ENABLED` - включает показ клипа после карточки рейда.
- `CLIP_FETCH_LIMIT`, `CLIP_LOOKBACK_DAYS`, `CLIP_MAX_DURATION_SECONDS` - параметры поиска клипа.
- `CLIP_AFTER_END_DELAY_MS` - задержка после окончания клипа.

`CLIENT_SECRET` не нужен и не должен храниться в проекте.

## Тест через URL

Показать рейд от конкретного канала:

```text
index.html?test_channel=fra3a
```

`test_channel` - Twitch login канала, который нужно считать рейдером. Overlay сам попробует получить аватар, данные канала/стрима и клип через Twitch API.

Показать только клип, без raid-карточки:

```text
index.html?test_channel=fra3a&test_clip_only=1
```

Параметр `test_clip_only=1` полезен для быстрой проверки выбора и воспроизведения клипа.

## TODO

- [ ] Описать, как получить Twitch Client ID.
