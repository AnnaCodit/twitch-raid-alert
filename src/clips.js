const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const TWITCH_GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const TWITCH_SO_CLIP_URL = 'https://twitch.so/pclipsmid/';
const CLIP_VIDEO_REQUEST_TIMEOUT = 8000;
const CLIP_VIDEO_READY_TIMEOUT = 10000;
const CLIP_VIDEO_FALLBACK_SHOW_TIME = 30000;
const DEFAULT_CLIP_AFTER_END_DELAY_MS = 2000;
const CLIP_VIDEO_QUALITY = 'best';

const clipWrapper = document.querySelector('.clip-wrapper');
const clipFrame = document.querySelector('.clip-frame');
const clipTitle = document.querySelector('.clip-title');
const clipStats = document.querySelector('.clip-stats');
const clipStatus = document.querySelector('.clip-terminal-status');

let activeClipVideo = null;

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

    resetClipVideo();
    clipTitle.textContent = clip.title || 'CLIP DATA LOADED';
    clipStats.textContent = formatClipStats(clip);
    setClipStatus('LOADING');
    setClipPreview(clip);
    clipWrapper.classList.add('show');

    try {
        await showClipVideo(clip);
    } catch (error) {
        console.warn('Не удалось воспроизвести клип:', error);
        setClipStatus('ERROR');
        await clipDelay(getClipFallbackDisplayTime(clip));
    } finally {
        await hideClip();
    }
}

async function hideClip() {
    clipWrapper?.classList.remove('show');
    await clipDelay(500);
    resetClipVideo();
    clearClipPreview();
    setClipStatus('READY');
}

async function showClipVideo(clip) {
    const primaryPlayback = await resolveClipPlayback(clip);
    const primaryVideo = createClipVideo(primaryPlayback.url);

    try {
        const autoplayStarted = await playClipVideo(primaryVideo);
        setClipStatus(autoplayStarted ? getPlaybackStatus(primaryPlayback.source) : 'CLICK PLAY');
        await waitForClipVideoEnd(primaryVideo, clip);
        return;
    } catch (error) {
        if (primaryPlayback.source !== 'graphql' || isAutoplayBlocked(error)) {
            throw error;
        }

        console.warn('GraphQL clip video failed, using twitch.so fallback:', error);
        resetClipVideo();
    }

    const fallbackVideo = createClipVideo(getTwitchSoClipUrl(getClipSlug(clip)));
    const fallbackAutoplayStarted = await playClipVideo(fallbackVideo);
    setClipStatus(fallbackAutoplayStarted ? 'FALLBACK' : 'CLICK PLAY');
    await waitForClipVideoEnd(fallbackVideo, clip);
}

async function resolveClipPlayback(clip) {
    const slug = getClipSlug(clip);

    if (!slug) {
        throw new Error('У клипа нет slug/id.');
    }

    try {
        const graphqlUrl = await fetchGraphqlClipVideoUrl(slug);

        if (graphqlUrl) {
            return {
                source: 'graphql',
                url: graphqlUrl
            };
        }
    } catch (error) {
        console.warn('GraphQL clip resolver failed, using twitch.so fallback:', error);
    }

    return {
        source: 'twitch.so',
        url: getTwitchSoClipUrl(slug)
    };
}

async function fetchGraphqlClipVideoUrl(slug) {
    const response = await fetchWithTimeout(TWITCH_GQL_URL, {
        method: 'POST',
        headers: {
            'Client-ID': TWITCH_GQL_CLIENT_ID,
            'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: JSON.stringify([{
            operationName: 'ClipsDownloadButton',
            variables: { slug },
            query: `query ClipsDownloadButton($slug: ID!) {
                clip(slug: $slug) {
                    videoQualities {
                        frameRate
                        quality
                        sourceURL
                    }
                    playbackAccessToken(params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }) {
                        signature
                        value
                    }
                }
            }`
        }])
    }, CLIP_VIDEO_REQUEST_TIMEOUT);

    if (!response.ok) {
        throw new Error(`Twitch GraphQL ответил ${response.status}`);
    }

    const payload = await response.json();
    const clip = payload?.[0]?.data?.clip;
    const quality = pickClipVideoQuality(clip?.videoQualities || []);
    const token = clip?.playbackAccessToken;

    if (!quality?.sourceURL || !token?.signature || !token?.value) {
        return '';
    }

    return signClipVideoUrl(quality.sourceURL, token);
}

function pickClipVideoQuality(qualities) {
    const available = qualities
        .filter(quality => quality?.sourceURL)
        .sort((a, b) => Number(b.quality || 0) - Number(a.quality || 0));

    if (CLIP_VIDEO_QUALITY === 'best') {
        return available[0] || null;
    }

    return available.find(quality => String(quality.quality) === String(CLIP_VIDEO_QUALITY)) || available[0] || null;
}

function signClipVideoUrl(sourceUrl, token) {
    const url = new URL(sourceUrl);
    url.searchParams.set('sig', token.signature);
    url.searchParams.set('token', token.value);
    return url.toString();
}

function createClipVideo(sourceUrl) {
    resetClipVideo();

    const video = document.createElement('video');
    video.className = 'clip-video';
    video.src = sourceUrl;
    video.autoplay = true;
    video.controls = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.muted = false;
    video.volume = 1;
    video.disablePictureInPicture = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');

    clipFrame.append(video);
    activeClipVideo = video;
    return video;
}

async function playClipVideo(video) {
    await waitForVideoReady(video);

    try {
        await video.play();
        return true;
    } catch (error) {
        if (isAutoplayBlocked(error)) {
            video.controls = true;
            setClipStatus('CLICK PLAY');
            return false;
        }

        throw error;
    }
}

function waitForVideoReady(video) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timeoutId);
            video.removeEventListener('loadeddata', handleReady);
            video.removeEventListener('canplay', handleReady);
            video.removeEventListener('error', handleError);
        };
        const handleReady = () => {
            cleanup();
            resolve();
        };
        const handleError = () => {
            cleanup();
            reject(new Error('Видео клипа не загрузилось.'));
        };
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Видео клипа не успело загрузиться.'));
        }, CLIP_VIDEO_READY_TIMEOUT);

        video.addEventListener('loadeddata', handleReady, { once: true });
        video.addEventListener('canplay', handleReady, { once: true });
        video.addEventListener('error', handleError, { once: true });
        video.load();
    });
}

function waitForClipVideoEnd(video, clip) {
    return new Promise(resolve => {
        let isResolved = false;

        const cleanup = () => {
            clearTimeout(timeoutId);
            video.removeEventListener('ended', finish);
            video.removeEventListener('error', finish);
        };
        const finish = () => {
            if (isResolved) return;

            isResolved = true;
            cleanup();
            resolve();
        };
        const timeoutId = setTimeout(finish, getClipFallbackDisplayTime(clip));

        video.addEventListener('ended', finish, { once: true });
        video.addEventListener('error', finish, { once: true });
    }).then(() => clipDelay(getClipAfterEndDelay()));
}

function getClipFallbackDisplayTime(clip) {
    const durationMs = Number(clip?.duration || 0) * 1000;

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return CLIP_VIDEO_FALLBACK_SHOW_TIME;
    }

    return Math.ceil(durationMs) + CLIP_VIDEO_READY_TIMEOUT + getClipAfterEndDelay();
}

function resetClipVideo() {
    if (!activeClipVideo) return;

    activeClipVideo.pause();
    activeClipVideo.removeAttribute('src');
    activeClipVideo.load();
    activeClipVideo.remove();
    activeClipVideo = null;
}

function setClipPreview(clip) {
    const thumbnailUrl = String(clip?.thumbnail_url || '').trim();

    if (!thumbnailUrl) {
        clearClipPreview();
        return;
    }

    clipFrame.style.backgroundImage = `url("${thumbnailUrl.replaceAll('"', '%22')}")`;
    clipFrame.style.backgroundPosition = 'center';
    clipFrame.style.backgroundSize = 'cover';
}

function clearClipPreview() {
    if (!clipFrame) return;

    clipFrame.style.backgroundImage = '';
    clipFrame.style.backgroundPosition = '';
    clipFrame.style.backgroundSize = '';
}

function formatClipStats(clip) {
    const views = Number(clip.view_count || 0).toLocaleString('ru-RU');
    const duration = Math.round(Number(clip.duration || 0));
    const marker = clip.is_featured ? 'FEATURED' : 'TOP_30D';
    return `${marker} // views ${views} // ${duration}s`;
}

function getClipSlug(clip) {
    return String(clip?.slug || clip?.id || '').trim();
}

function getTwitchSoClipUrl(slug) {
    return `${TWITCH_SO_CLIP_URL}${encodeURIComponent(slug)}`;
}

function setClipStatus(status) {
    if (clipStatus) clipStatus.textContent = status;
}

function getPlaybackStatus(source) {
    return source === 'graphql' ? 'GRAPHQL' : 'FALLBACK';
}

function getClipAfterEndDelay() {
    const delayMs = Number(
        typeof CLIP_AFTER_END_DELAY_MS === 'undefined'
            ? DEFAULT_CLIP_AFTER_END_DELAY_MS
            : CLIP_AFTER_END_DELAY_MS
    );

    if (!Number.isFinite(delayMs) || delayMs < 0) {
        return DEFAULT_CLIP_AFTER_END_DELAY_MS;
    }

    return delayMs;
}

function isAutoplayBlocked(error) {
    return error?.name === 'NotAllowedError';
}

function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}

function clipDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
