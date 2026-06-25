const container = document.querySelector('.raid-wrapper');
const avatarEl = document.querySelector('.avatar');
const nickname = document.querySelector('.raid-nickname .value');
const raid_viewers = document.querySelector('.raid-viewers .value');
const streamTitle = document.querySelector('.raid-stream-title');
const category = document.querySelector('.raid-stream-category .name');
const description = document.querySelector('.raid-description');
const clipWrapper = document.querySelector('.clip-wrapper');
const clipFrame = document.querySelector('.clip-frame');
const clipTitle = document.querySelector('.clip-title');
const clipStats = document.querySelector('.clip-stats');
const clipSoundPanel = document.querySelector('.clip-sound-panel');
const clipSoundStatus = document.querySelector('.clip-sound-panel__status');
const clipSoundButton = document.querySelector('.clip-sound-panel__button');
const DEFAULT_AVATAR = avatarEl.style.backgroundImage;

const raidQueue = [];
let isRaidShowing = false;
let chatClient = null;
let chatStarted = false;
let initialTriggersStarted = false;
let clipIframe = null;
let clipPlayer = null;
let clipSoundUnlockResolve = null;

clipSoundButton?.addEventListener('click', () => {
    unlockClipSound().catch(error => {
        if (clipSoundStatus) {
            clipSoundStatus.textContent = `Не удалось подготовить звук: ${error.message}`;
        }
    });
});

initTwitchAuthorization({
    onAuthorized: startOverlay,
    onReset: stopTwitchChat
});

async function startOverlay() {
    await ensureClipSoundUnlocked();
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
    if (!CLIPS_ENABLED || !clip || !clipWrapper || !clipFrame) return;

    resetClipPlayback();
    clipTitle.textContent = clip.title || 'CLIP DATA LOADED';
    clipStats.textContent = formatClipStats(clip);
    clipWrapper.classList.add('show');

    await showClipPlayback(clip);
    await delay(getClipDisplayTime(clip));
    await hideClip();
}

function getClipDisplayTime(clip) {
    const durationMs = Number(clip?.duration || 0) * 1000;

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return CLIP_SHOW_TIME;
    }

    return Math.ceil(durationMs) + CLIP_END_BUFFER_MS;
}

function resetClipPlayback() {
    if (clipPlayer?.destroy) {
        clipPlayer.destroy();
    }

    clipPlayer = null;

    if (!clipIframe) return;

    clipIframe.remove();
    clipIframe = null;
}

async function showClipPlayback(clip) {
    if (canUseVodPlayerForClip(clip)) {
        await showClipVodPlayer(clip);
        return;
    }

    await showClipIframe(clip);
}

function canUseVodPlayerForClip(clip) {
    return Boolean(
        CLIP_USE_VOD_PLAYER_IF_AVAILABLE &&
        window.Twitch?.Player &&
        clip?.video_id &&
        Number.isFinite(Number(clip.vod_offset))
    );
}

async function showClipVodPlayer(clip) {
    await nextFrame();
    await delay(500);

    clipIframe = createClipPlayerHost();
    clipPlayer = new Twitch.Player(clipIframe, {
        width: '100%',
        height: '100%',
        video: formatTwitchVideoId(clip.video_id),
        time: formatTwitchTime(getClipVodStartOffset(clip)),
        parent: [location.hostname || 'localhost'],
        autoplay: true,
        muted: CLIP_IFRAME_MUTED
    });

    await waitForTwitchPlayerReady(clipPlayer);
    forceClipPlayerAudio(clipPlayer);
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

    await nextFrame();
    await delay(500);
    clipIframe = createClipIframe();
    await nextFrame();
    const iframeReady = waitForClipIframeLoad(clipIframe);
    clipIframe.src = `https://clips.twitch.tv/embed?${params.toString()}`;
    await iframeReady;
}

function createClipPlayerHost() {
    const host = document.createElement('div');
    host.className = 'clip-player-host';
    host.style.opacity = '1';
    clipFrame.prepend(host);
    return host;
}

function waitForTwitchPlayerReady(player) {
    return new Promise(resolve => {
        let isResolved = false;

        const finish = () => {
            if (isResolved) return;

            isResolved = true;
            clearTimeout(timeoutId);
            resolve();
        };

        const timeoutId = setTimeout(finish, CLIP_IFRAME_LOAD_TIMEOUT_MS);
        player.addEventListener(Twitch.Player.READY, finish);
    });
}

function forceClipPlayerAudio(player) {
    try {
        player.setMuted(false);
        player.setVolume(CLIP_PLAYER_VOLUME);
        player.play();
    } catch (error) {
        console.warn('Не удалось программно включить звук Twitch Player:', error);
    }
}

function formatTwitchVideoId(videoId) {
    const value = String(videoId || '').trim();
    return value.startsWith('v') ? value : `v${value}`;
}

function getClipVodStartOffset(clip) {
    const vodOffset = Number(clip?.vod_offset);
    const duration = Number(clip?.duration || 0);

    if (!Number.isFinite(vodOffset)) return 0;

    if (CLIP_VOD_OFFSET_MODE === 'end') {
        return Math.max(0, vodOffset - (Number.isFinite(duration) ? duration : 0));
    }

    return Math.max(0, vodOffset);
}

function formatTwitchTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const restSeconds = seconds % 60;

    return `${hours}h${minutes}m${restSeconds}s`;
}

function waitForClipIframeLoad(iframe) {
    return new Promise(resolve => {
        let isResolved = false;

        const finish = () => {
            if (isResolved) return;

            isResolved = true;
            clearTimeout(timeoutId);
            iframe.removeEventListener('load', finish);
            resolve();
        };

        const timeoutId = setTimeout(finish, CLIP_IFRAME_LOAD_TIMEOUT_MS);
        iframe.addEventListener('load', finish, { once: true });
    });
}

function createClipIframe() {
    const iframe = document.createElement('iframe');
    iframe.className = 'clip-iframe';
    iframe.title = 'Twitch clip';
    iframe.allow = 'autoplay; fullscreen';
    iframe.allowFullscreen = true;
    iframe.style.opacity = '1';
    clipFrame.prepend(iframe);
    return iframe;
}

async function hideClip() {
    if (clipIframe) {
        clipIframe.style.opacity = '0';
    }

    clipWrapper.classList.remove('show');
    await delay(500);
    resetClipPlayback();
}

function formatClipStats(clip) {
    const views = Number(clip.view_count || 0).toLocaleString('ru-RU');
    const duration = Math.round(Number(clip.duration || 0));
    const marker = clip.is_featured ? 'FEATURED' : 'TOP_30D';
    return `${marker} // 👀 ${views} // 🕑 ${duration}`;
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

function ensureClipSoundUnlocked() {
    if (!needsClipSoundUnlock()) {
        clipSoundPanel?.classList.add('is-hidden');
        return Promise.resolve();
    }

    showClipSoundPanel();

    return new Promise(resolve => {
        clipSoundUnlockResolve = resolve;
    });
}

function needsClipSoundUnlock() {
    const userActivation = navigator.userActivation;
    const alreadyActivated = Boolean(userActivation?.hasBeenActive || userActivation?.isActive);
    return CLIPS_ENABLED && !CLIP_IFRAME_MUTED && !alreadyActivated;
}

function showClipSoundPanelIfNeeded() {
    if (!clipSoundPanel) return;

    const needsSoundUnlock = needsClipSoundUnlock();

    clipSoundPanel.classList.toggle('is-hidden', !needsSoundUnlock);

    if (needsSoundUnlock) showClipSoundPanel();
}

function showClipSoundPanel() {
    clipSoundPanel?.classList.remove('is-hidden');

    if (clipSoundStatus) {
        clipSoundStatus.textContent = 'Нажми один раз, чтобы браузер разрешил клипам запускаться со звуком. После этого overlay запустит рейды.';
    }
}

async function unlockClipSound() {
    await primeAudioContext();
    clipSoundPanel?.classList.add('is-hidden');
    clipSoundUnlockResolve?.();
    clipSoundUnlockResolve = null;
    console.log('Clip sound unlock received.');
}

async function primeAudioContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    oscillator.stop(audioContext.currentTime + 0.01);
    setTimeout(() => audioContext.close().catch(() => { }), 50);
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
