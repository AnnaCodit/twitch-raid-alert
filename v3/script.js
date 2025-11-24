const container = document.querySelector('.raid-wrapper');
const avatarEl = document.querySelector('.avatar');
const nickname = document.querySelector('.raid-nickname .value');
const raid_viewers = document.querySelector('.raid-viewers .value');
const streamTitle = document.querySelector('.raid-stream-title');
const category = document.querySelector('.raid-stream-category .name');
const description = document.querySelector('.raid-description');

// Queue system
const raidQueue = [];
let isRaidShowing = false;

const client = new tmi.Client({
    connection: { secure: true, reconnect: true },
    channels: [CHANNEL]
});

client.connect();
client.on('raided', async (channel, username, viewers) => {
    await initRaid(username, viewers);
});

async function initRaid(username, viewers) {
    const token = await getAppToken();
    const userData = await twitchAPI(`users?login=${encodeURIComponent(username)}`, token);
    const user = userData?.data?.[0];
    console.log(userData);

    if (!user) return;

    const streamData = await twitchAPI(`streams?user_id=${user.id}`, token);
    const stream = streamData?.data?.[0];
    console.log(streamData);

    // Add to queue instead of showing immediately
    raidQueue.push({
        username,
        viewers,
        user,
        stream
    });

    processQueue();
}

async function processQueue() {
    if (isRaidShowing) return;
    if (raidQueue.length === 0) return;

    isRaidShowing = true;
    const data = raidQueue.shift();

    await showRaid(data);

    isRaidShowing = false;
    // Small buffer before next raid? Optional.
    setTimeout(processQueue, 100);
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
        }
    };
    // Also use queue for test
    raidQueue.push(data);
    processQueue();
}

function showRaid(data) {
    return new Promise(async (resolve) => {
        const { username, viewers, user, stream } = data;

        raid_viewers.textContent = `${viewers}`;
        // raid_viewers.textContent = `${viewers} viewer${viewers === 1 ? '' : 's'}`;
        avatarEl.style.backgroundImage = `url('${user.profile_image_url}')`;
        description.textContent = `${user.description}`;

        let titleText = "";
        let categoryText = "";
        if (stream) {
            titleText = `${stream.title}`;
            categoryText = `${stream.game_name}`;
        } else {
            titleText = STREAM_TITLE_IF_EMPTY;
            categoryText = STREAM_CATEGORY_IF_EMPTY;
        }

        container.classList.add('show');

        nickname.textContent = '';
        streamTitle.textContent = '';
        category.textContent = '';

        // Wait for fade in
        await new Promise(r => setTimeout(r, 600));

        // Typing effect
        await typeWriter(nickname, username, 100);
        await typeWriter(streamTitle, titleText, 40);
        await typeWriter(category, categoryText, 20);

        // Wait for SHOW_TIME
        await new Promise(r => setTimeout(r, SHOW_TIME));

        container.classList.remove('show');

        // Wait for hide animation (0.5s from CSS)
        await new Promise(r => setTimeout(r, 600)); // 600ms to be safe

        resolve();
    });
}

function typeWriter(element, text, speed = 50) {
    return new Promise(resolve => {
        if (element.typingTimeout) clearTimeout(element.typingTimeout);
        element.textContent = "";
        element.classList.add('typing-cursor');
        let i = 0;

        function type() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
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

async function twitchAPI(endpoint, token) {
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': CLIENT_ID, 'Authorization': 'Bearer ' + token }
    });
    return res.ok ? res.json() : null;
}

/***********************
 * АВТОМАТИЧЕСКИЙ ТОКЕН
 ***********************/
async function getAppToken() {
    // проверяем localStorage
    const saved = JSON.parse(localStorage.getItem('twitch_token') || '{}');
    const now = Date.now() / 1000;
    if (saved.access_token && saved.expires_at > now + 300) {
        return saved.access_token;
    }

    if (!CLIENT_SECRET) {
        alert("⚠️ CLIENT_SECRET не указан — невозможно обновить токен.");
        throw new Error("Нет CLIENT_SECRET");
    }

    // получаем новый
    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, {
        method: 'POST'
    });
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

client.on('connected', () => console.log('Raid overlay connected.'));

if (TEST_MODE) {
    SHOW_TIME = TEST_SHOW_TIME;
    showTestRaid();
}