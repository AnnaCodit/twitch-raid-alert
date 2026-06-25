const container = document.querySelector('.raid-wrapper');
const avatarEl = document.querySelector('.avatar');
const nickname = document.querySelector('.raid-nickname .value');
const raid_viewers = document.querySelector('.raid-viewers .value');
const streamTitle = document.querySelector('.raid-stream-title');
const category = document.querySelector('.raid-stream-category .name');
const description = document.querySelector('.raid-description');
const clipWrapper = document.querySelector('.clip-wrapper');
const clipIframe = document.querySelector('.clip-iframe');
const clipTitle = document.querySelector('.clip-title');
const clipStats = document.querySelector('.clip-stats');
const authPanel = document.querySelector('.auth-panel');
const authStatus = document.querySelector('.auth-panel__status');
const authLink = document.querySelector('.auth-panel__link');
const authUrl = document.querySelector('.auth-panel__url');
const authCode = document.querySelector('.auth-panel__code');
const authConnectButton = document.querySelector('.auth-panel__connect');
const authResetButton = document.querySelector('.auth-panel__reset');
const DEFAULT_AVATAR = avatarEl.style.backgroundImage;
const TWITCH_REQUEST_TIMEOUT = 8000;
const TWITCH_AUTH_STORAGE_KEY = 'badge-on-raid:twitch-auth';
const TWITCH_AUTH_SCOPES = [];

const raidQueue = [];
let isRaidShowing = false;
let chatClient = null;
let chatStarted = false;
let initialTriggersStarted = false;
let twitchAuth = loadTwitchAuth();
let devicePollAbort = null;

authConnectButton?.addEventListener('click', () => {
    startDeviceAuthorization().catch(error => showAuthPanel(`Ошибка авторизации: ${error.message}`, true));
});

authResetButton?.addEventListener('click', () => {
    resetAuth();
    showAuthPanel('Токен сброшен. Нажми "Подключить Twitch", чтобы авторизоваться заново.');
});

boot().catch(error => showAuthPanel(`Ошибка запуска: ${error.message}`, true));

async function boot() {
    resetDeviceUi();
    localStorage.removeItem('twitch_token');

    if (!getTwitchClientId()) {
        showAuthPanel('Укажи CLIENT_ID в config.js. CLIENT_SECRET больше не нужен.');
        return;
    }

    if (!twitchAuth) {
        showAuthPanel('Нужна авторизация Twitch. Нажми "Подключить Twitch".');
        return;
    }

    try {
        showAuthPanel('Проверяю Twitch token...');
        await ensureFreshToken();
    } catch (error) {
        resetAuth({ keepUi: true });
        showAuthPanel(`Не удалось обновить Twitch token: ${error.message}`, true);
        return;
    }

    hideAuthPanel();
    startTwitchChat();
    startInitialTriggers();
}

function startTwitchChat() {
    if (chatStarted) return;

    chatStarted = true;
    chatClient = new tmi.Client({
        connection: { secure: true, reconnect: true },
        channels: [CHANNEL]
    });

    chatClient.on('raided', (channel, username, viewers) => {
        initRaid(username, viewers);
    });
    chatClient.on('connected', () => console.log('Raid overlay connected.'));
    chatClient.connect().catch(error => console.error('Не удалось подключиться к Twitch-чату:', error));
}

function startInitialTriggers() {
    if (initialTriggersStarted) return;
    initialTriggersStarted = true;

    if (showTestRaidFromQuery()) {
        console.log('Запущен тестовый raid из URL параметра test_channel.');
    } else if (TEST_MODE) {
        SHOW_TIME = TEST_SHOW_TIME;
        showTestRaid();
    }
}

function initRaid(username, viewers) {
    raidQueue.push({
        username,
        viewers,
        user: null,
        stream: null,
        channelInfo: null,
        clip: null
    });

    processQueue();
}

async function enrichRaidData(raidData) {
    try {
        const userData = await fetchTwitchAPI(`users?login=${encodeURIComponent(raidData.username)}`);
        const user = userData?.data?.[0];

        if (user) {
            const [streamData, channelData] = await Promise.all([
                fetchTwitchAPI(`streams?user_id=${user.id}`),
                fetchTwitchAPI(`channels?broadcaster_id=${user.id}`)
            ]);

            raidData.user = user;
            raidData.stream = streamData?.data?.[0] || null;
            raidData.channelInfo = channelData?.data?.[0] || null;
            raidData.clip = await fetchRaiderClip(user.id);
        } else {
            console.warn('Twitch user not found for raid:', raidData.username);
        }
    } catch (error) {
        console.error('Не удалось получить данные рейдера из Twitch API:', error);
    }

    return raidData;
}

async function processQueue() {
    if (isRaidShowing) return;
    if (raidQueue.length === 0) return;

    isRaidShowing = true;
    const data = raidQueue.shift();

    try {
        await enrichRaidData(data);
        await showRaid(data);
    } catch (error) {
        console.error('Ошибка показа рейда:', error);
    } finally {
        isRaidShowing = false;
        setTimeout(processQueue, 100);
    }
}

function showTestRaid() {
    const data = {
        username: "KaySenat",
        viewers: 100,
        user: {
            profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/bc0af20e-b4db-4205-a2ba-f6aaf2903c1d-profile_image-70x70.png"
        },
        stream: {
            title: "⚡ ПРОДОЛЖАЮ ПОЗОРИТЬСЯ 😩 НО НЕ СДАЮСЬ 😭 БЕЗ ПОНЯТИЯ ЧТО Я ДЕЛАЮ 💀 ПАРА ПРИКОЛОВ 🎁 НОЛЬ ХАЙПА 😪 ТОЛЬКО ДЛЯ СПЯЩИХ БИЗНЕСМЕНОВ 🌙🌚",
            game_name: "Software & Game Dev"
        },
        channelInfo: null,
        clip: {
            id: "IncredulousAbstemiousFennelImGlitch",
            title: "Тестовый клип рейдера",
            view_count: 1337,
            created_at: new Date().toISOString(),
            duration: 24,
            thumbnail_url: "https://clips-media-assets2.twitch.tv/AT-cm%7C517806597-preview-480x272.jpg",
            is_featured: true
        }
    };

    raidQueue.push(data);
    processQueue();
}

function showTestRaidFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const username = normalizeTestChannel(params.get('test_channel'));

    if (!username) return false;

    const viewers = Math.max(1, Number.parseInt(params.get('test_viewers') || '100', 10) || 100);
    initRaid(username, viewers);
    return true;
}

function normalizeTestChannel(value) {
    return String(value || '')
        .trim()
        .replace(/^[@#]+/, '')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .slice(0, 25);
}

async function showRaid(data) {
    const { username, viewers, user, stream, channelInfo } = data;

    raid_viewers.textContent = `${viewers}`;
    if (user?.profile_image_url) {
        avatarEl.style.backgroundImage = `url('${user.profile_image_url}')`;
    } else {
        avatarEl.style.backgroundImage = DEFAULT_AVATAR;
    }
    description.textContent = user?.description || '';

    const titleText = stream?.title || channelInfo?.title || STREAM_TITLE_IF_EMPTY;
    const categoryText = stream?.game_name || channelInfo?.game_name || STREAM_CATEGORY_IF_EMPTY;

    container.classList.add('show');

    nickname.textContent = '';
    streamTitle.textContent = '';
    category.textContent = '';

    await delay(600);
    await typeWriter(nickname, username, 100);
    await typeWriter(streamTitle, titleText, 40);
    await typeWriter(category, categoryText, 20);
    await delay(SHOW_TIME);

    container.classList.remove('show');
    await delay(600);
    await showClip(data.clip);
}

async function fetchRaiderClip(broadcasterId) {
    if (!CLIPS_ENABLED) return null;

    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - CLIP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
        broadcaster_id: broadcasterId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        first: String(CLIP_FETCH_LIMIT)
    });
    const clipsData = await fetchTwitchAPI(`clips?${params.toString()}`);
    const clips = clipsData?.data || [];
    const shortClips = clips.filter(clip => Number(clip.duration || 0) <= CLIP_MAX_DURATION_SECONDS);

    if (shortClips.length === 0) return null;

    const featuredClip = shortClips
        .filter(clip => clip.is_featured)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    if (featuredClip) return featuredClip;

    return shortClips
        .slice()
        .sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0))[0];
}

async function showClip(clip) {
    if (!CLIPS_ENABLED || !clip || !clipWrapper || !clipIframe) return;

    resetClipPlayback();
    clipTitle.textContent = clip.title || 'CLIP DATA LOADED';
    clipStats.textContent = formatClipStats(clip);
    clipWrapper.classList.add('show');

    await showClipIframe(clip);
    await delay(CLIP_SHOW_TIME);
    await hideClip();
}

function resetClipPlayback() {
    clipIframe.classList.remove('show');
    clipIframe.removeAttribute('src');
}

async function showClipIframe(clip) {
    const parent = location.hostname || 'localhost';
    const params = new URLSearchParams({
        clip: clip.id,
        parent,
        autoplay: 'true',
        muted: String(CLIP_IFRAME_MUTED),
        preload: 'metadata'
    });

    clipIframe.classList.add('show');
    await nextFrame();
    await delay(500);
    clipIframe.src = `https://clips.twitch.tv/embed?${params.toString()}`;
}

async function hideClip() {
    clipWrapper.classList.remove('show');
    await delay(500);
    resetClipPlayback();
}

function formatClipStats(clip) {
    const views = Number(clip.view_count || 0).toLocaleString('ru-RU');
    const duration = Math.round(Number(clip.duration || 0));
    const marker = clip.is_featured ? 'FEATURED' : 'TOP_30D';
    return `${marker} // ${views} просмотров // ${duration} сек`;
}

function typeWriter(element, text, speed = 50) {
    return new Promise(resolve => {
        if (element.typingTimeout) clearTimeout(element.typingTimeout);
        element.textContent = "";
        element.classList.add('typing-cursor');
        const chars = Array.from(String(text || ''));
        let i = 0;

        function type() {
            if (i < chars.length) {
                element.textContent += chars[i];
                i++;
                element.typingTimeout = setTimeout(type, speed);
            } else {
                element.typingTimeout = null;
                element.classList.remove('typing-cursor');
                resolve();
            }
        }
        type();
    });
}

async function fetchTwitchAPI(endpoint) {
    let token = await ensureFreshToken();
    let result = await twitchAPI(endpoint, token.access_token);

    if (result.ok) return result.data;
    if (result.status !== 401 && result.status !== 403) return null;

    token = await ensureFreshToken(true);
    result = await twitchAPI(endpoint, token.access_token);
    return result.ok ? result.data : null;
}

async function twitchAPI(endpoint, accessToken) {
    try {
        const res = await fetchWithTimeout(`https://api.twitch.tv/helix/${endpoint}`, {
            headers: {
                'Client-ID': getTwitchClientId(),
                'Authorization': 'Bearer ' + accessToken
            }
        }, TWITCH_REQUEST_TIMEOUT);

        if (res.ok) {
            return {
                ok: true,
                status: res.status,
                data: await res.json()
            };
        }

        const body = await res.text();
        console.warn(`Twitch API error ${res.status} for ${endpoint}:`, body);
        return {
            ok: false,
            status: res.status,
            data: null
        };
    } catch (error) {
        console.warn(`Twitch API request failed for ${endpoint}:`, error);
        return {
            ok: false,
            status: 0,
            data: null
        };
    }
}

async function startDeviceAuthorization() {
    const clientId = getTwitchClientId();
    if (!clientId) {
        throw new Error('Укажи CLIENT_ID в config.js.');
    }

    resetAuth({ keepUi: true });
    showAuthPanel('Запрашиваю device code у Twitch...');

    const device = await twitchTokenRequest('https://id.twitch.tv/oauth2/device', {
        client_id: clientId,
        scopes: TWITCH_AUTH_SCOPES.join(' ')
    });

    const verificationUrl = device.verification_uri_complete || device.verification_uri || '';
    authLink.href = verificationUrl;
    authLink.textContent = verificationUrl || 'Открыть Twitch Activate';
    authLink.classList.remove('is-hidden');
    authUrl.value = verificationUrl;
    authUrl.classList.remove('is-hidden');
    authCode.textContent = device.user_code || '';
    authCode.classList.remove('is-hidden');
    showAuthPanel('Открой ссылку, введи код и разреши доступ. Оверлей продолжит сам.');

    devicePollAbort = new AbortController();
    twitchAuth = await pollDeviceToken(device, devicePollAbort.signal);
    saveTwitchAuth(twitchAuth);
    showAuthPanel('Авторизация получена. Запускаю оверлей...');
    await boot();
}

async function pollDeviceToken(device, signal) {
    const startedAt = Date.now();
    let intervalMs = Math.max(5, Number(device.interval) || 5) * 1000;

    while (Date.now() - startedAt < Number(device.expires_in || 0) * 1000) {
        await delay(intervalMs, signal);

        try {
            return await twitchTokenRequest('https://id.twitch.tv/oauth2/token', {
                client_id: getTwitchClientId(),
                scopes: TWITCH_AUTH_SCOPES.join(' '),
                device_code: device.device_code,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            });
        } catch (error) {
            const message = String(error.twitchMessage || error.message || '');

            if (message.includes('authorization_pending')) {
                continue;
            }

            if (message.includes('slow_down')) {
                intervalMs += 5000;
                continue;
            }

            throw error;
        }
    }

    throw new Error('Device code истек. Запусти подключение еще раз.');
}

async function ensureFreshToken(forceRefresh = false) {
    if (!twitchAuth) {
        throw new Error('Нет Twitch token.');
    }

    const expiresAt = Number(twitchAuth.expires_at) || 0;
    if (!forceRefresh && Date.now() < expiresAt - 60_000) {
        return twitchAuth;
    }

    if (!twitchAuth.refresh_token) {
        resetAuth();
        throw new Error('Токен истек, refresh token отсутствует. Авторизуйся заново.');
    }

    const nextToken = await twitchTokenRequest('https://id.twitch.tv/oauth2/token', {
        client_id: getTwitchClientId(),
        grant_type: 'refresh_token',
        refresh_token: twitchAuth.refresh_token
    });
    twitchAuth = nextToken;
    saveTwitchAuth(nextToken);
    return nextToken;
}

async function twitchTokenRequest(url, body) {
    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toFormBody(body)
    }, TWITCH_REQUEST_TIMEOUT);

    const data = await safeJson(res);
    if (!res.ok) {
        const error = new Error(data.message || data.error_description || data.error || `Twitch ответил ${res.status}`);
        error.twitchMessage = data.message || data.error_description || data.error;
        throw error;
    }

    if (data.access_token) {
        data.expires_at = Date.now() + Number(data.expires_in || 0) * 1000;
    }

    return data;
}

function toFormBody(values) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, value);
        }
    });
    return params;
}

function getTwitchClientId() {
    return String(typeof CLIENT_ID === 'undefined' ? '' : CLIENT_ID).trim();
}

function loadTwitchAuth() {
    try {
        return JSON.parse(localStorage.getItem(TWITCH_AUTH_STORAGE_KEY) || 'null');
    } catch (error) {
        console.warn('Некорректный сохраненный Twitch token, очищаем cache:', error);
        localStorage.removeItem(TWITCH_AUTH_STORAGE_KEY);
        return null;
    }
}

function saveTwitchAuth(auth) {
    localStorage.setItem(TWITCH_AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function resetAuth(options = {}) {
    if (devicePollAbort) {
        devicePollAbort.abort();
        devicePollAbort = null;
    }

    if (chatClient) {
        chatClient.disconnect().catch(() => {});
        chatClient = null;
    }

    chatStarted = false;
    twitchAuth = null;
    localStorage.removeItem(TWITCH_AUTH_STORAGE_KEY);
    localStorage.removeItem('twitch_token');

    if (!options.keepUi) {
        resetDeviceUi();
    }
}

function showAuthPanel(message, isError = false) {
    if (!authPanel) return;
    authPanel.classList.remove('is-hidden');
    authStatus.textContent = message;
    authStatus.style.color = isError ? '#ff8a8a' : '';
}

function hideAuthPanel() {
    authPanel?.classList.add('is-hidden');
}

function resetDeviceUi() {
    authLink?.classList.add('is-hidden');
    authUrl?.classList.add('is-hidden');
    authCode?.classList.add('is-hidden');

    if (authLink) {
        authLink.href = '#';
        authLink.textContent = 'Открыть Twitch Activate';
    }

    if (authUrl) authUrl.value = '';
    if (authCode) authCode.textContent = '';
}

async function safeJson(response) {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, ms);

        signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}
