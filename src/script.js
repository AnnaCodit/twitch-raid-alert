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
const DEFAULT_AVATAR = avatarEl.style.backgroundImage;
const TWITCH_REQUEST_TIMEOUT = 8000;

// Queue system
const raidQueue = [];
let isRaidShowing = false;

const client = new tmi.Client({
    connection: { secure: true, reconnect: true },
    channels: [CHANNEL]
});

client.on('raided', (channel, username, viewers) => {
    initRaid(username, viewers);
});
client.on('connected', () => console.log('Raid overlay connected.'));
client.connect().catch(error => console.error('Не удалось подключиться к Twitch-чату:', error));

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
        // Small buffer before next raid? Optional.
        setTimeout(processQueue, 100);
    }
}

function showTestRaid() {
    const data = {
        username: "KaySenat",
        // username: "NikoChan_bubububu_1337_adsad",
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
    // Also use queue for test
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
    // raid_viewers.textContent = `${viewers} viewer${viewers === 1 ? '' : 's'}`;
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

    // Wait for fade in
    await delay(600);

    // Typing effect
    await typeWriter(nickname, username, 100);
    await typeWriter(streamTitle, titleText, 40);
    await typeWriter(category, categoryText, 20);

    // Wait for SHOW_TIME
    await delay(SHOW_TIME);

    container.classList.remove('show');

    // Wait for hide animation (0.5s from CSS)
    await delay(600); // 600ms to be safe

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
    let token = await getAppToken();
    let result = await twitchAPI(endpoint, token);

    if (result.ok) return result.data;
    if (result.status !== 401 && result.status !== 403) return null;

    localStorage.removeItem('twitch_token');
    token = await getAppToken(true);
    result = await twitchAPI(endpoint, token);
    return result.ok ? result.data : null;
}

async function twitchAPI(endpoint, token) {
    try {
        const res = await fetchWithTimeout(`https://api.twitch.tv/helix/${endpoint}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': 'Bearer ' + token }
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

/***********************
 * АВТОМАТИЧЕСКИЙ ТОКЕН
 ***********************/
async function getAppToken(forceRefresh = false) {
    // проверяем localStorage
    const saved = readSavedToken();
    const now = Date.now() / 1000;
    if (!forceRefresh && saved.access_token && saved.expires_at > now + 300) {
        console.log('✅ Используем сохраненный токен');
        return saved.access_token;
    }

    if (!CLIENT_SECRET) {
        alert("⚠️ CLIENT_SECRET не указан — невозможно обновить токен.");
        throw new Error("Нет CLIENT_SECRET");
    }

    if (!CLIENT_ID) {
        alert("⚠️ CLIENT_ID не указан — невозможно получить Twitch token.");
        throw new Error("Нет CLIENT_ID");
    }

    // получаем новый
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'client_credentials'
    });
    const res = await fetchWithTimeout('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    }, TWITCH_REQUEST_TIMEOUT);
    if (!res.ok) {
        const body = await res.text();
        console.warn(`Twitch token error ${res.status}:`, body);
        throw new Error("Не удалось получить Twitch token");
    }
    const data = await res.json();
    if (!data.access_token) throw new Error("Не удалось получить токен Twitch");
    const expires_at = now + (data.expires_in || 0);
    localStorage.setItem('twitch_token', JSON.stringify({
        access_token: data.access_token,
        expires_at
    }));
    console.log('✅ Новый Twitch token получен, действует до', new Date(expires_at * 1000).toLocaleString());
    return data.access_token;
}

function readSavedToken() {
    try {
        return JSON.parse(localStorage.getItem('twitch_token') || '{}');
    } catch (error) {
        console.warn('Некорректный сохраненный Twitch token, очищаем cache:', error);
        localStorage.removeItem('twitch_token');
        return {};
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

if (showTestRaidFromQuery()) {
    console.log('Запущен тестовый raid из URL параметра test_channel.');
} else if (TEST_MODE) {
    SHOW_TIME = TEST_SHOW_TIME;
    showTestRaid();
}
