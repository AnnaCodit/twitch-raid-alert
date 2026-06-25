const container = document.querySelector('.raid-wrapper');
const avatarEl = document.querySelector('.avatar');
const nickname = document.querySelector('.raid-nickname .value');
const raid_viewers = document.querySelector('.raid-viewers .value');
const streamTitle = document.querySelector('.raid-stream-title');
const category = document.querySelector('.raid-stream-category .name');
const description = document.querySelector('.raid-description');
const DEFAULT_AVATAR = avatarEl.style.backgroundImage;

const raidQueue = [];
let isRaidShowing = false;
let chatClient = null;
let chatStarted = false;
let initialTriggersStarted = false;

initTwitchAuthorization({
    onAuthorized: startOverlay,
    onReset: stopTwitchChat
});

function startOverlay() {
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

function stopTwitchChat() {
    if (chatClient) {
        chatClient.disconnect().catch(() => { });
        chatClient = null;
    }

    chatStarted = false;
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

function initRaid(username, viewers, options = {}) {
    raidQueue.push({
        username,
        viewers,
        user: null,
        stream: null,
        channelInfo: null,
        clip: null,
        clipOnly: Boolean(options.clipOnly)
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
        if (data.clipOnly) {
            await showClip(data.clip);
        } else {
            await showRaid(data);
        }
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
    const clipOnly = isTruthyQueryParam(params.get('test_clip_only') || params.get('clip_only'));
    initRaid(username, viewers, { clipOnly });
    return true;
}

function isTruthyQueryParam(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
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

function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, ms);

        signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}
