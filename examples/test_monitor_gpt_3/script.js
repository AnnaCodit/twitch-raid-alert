/***********************
 * НАСТРОЙКИ
 ***********************/
const CHANNEL = "FRA3A"; // без #
const SHOW_TIME = 8000; // мс

const container = document.querySelector('.card');
const avatarEl = document.querySelector('.avatar');
const nickname = document.querySelector('.raid-nickname');
const raid_viewers = document.querySelector('.raid-viewers');
const streamTitle = document.querySelector('.raid-stream-title');
const category = document.querySelector('.raid-stream-category');
const description = document.querySelector('.raid-description');

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

    if (!user) return; 0

    const streamData = await twitchAPI(`streams?user_id=${user.id}`, token);
    const stream = streamData?.data?.[0];
    console.log(streamData);

    showRaid({
        username,
        viewers,
        user,
        stream
    });
}

function showTestRaid() {
    const data = {
        username: "NikoChan",
        viewers: 100,
        user: {
            profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/test.png"
        },
        stream: {
            title: "Let's talk about code",
            game_name: "Software & Game Dev"
        }
    };
    showRaid(data);
}

function showRaid(data) {
    const { username, viewers, user, stream } = data;

    nickname.textContent = `${username}`;
    raid_viewers.textContent = `${viewers} viewer${viewers === 1 ? '' : 's'}`;
    avatarEl.style.backgroundImage = `url('${user.profile_image_url}')`;
    description.textContent = `${user.description}`;


    if (stream) {
        streamTitle.textContent = `${stream.title}`;
        category.textContent = `Category: ${stream.game_name}`;
    } else {
        category.textContent = `Currently offline`;
        streamTitle.textContent = ``;
    }

    container.classList.add('show');
    clearTimeout(window._hideTimer);
    window._hideTimer = setTimeout(() => container.classList.remove('show'), SHOW_TIME);
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
