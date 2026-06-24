const container = document.querySelector('.raid-wrapper');
const avatarEl = document.querySelector('.avatar');
const nickname = document.querySelector('.raid-nickname .value');
const raid_viewers = document.querySelector('.raid-viewers .value');
const streamTitle = document.querySelector('.raid-stream-title');
const category = document.querySelector('.raid-stream-category .name');
const description = document.querySelector('.raid-description');
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
        channelInfo: null
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
        channelInfo: null
    };
    // Also use queue for test
    raidQueue.push(data);
    processQueue();
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

function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}

if (TEST_MODE) {
    SHOW_TIME = TEST_SHOW_TIME;
    showTestRaid();
}
