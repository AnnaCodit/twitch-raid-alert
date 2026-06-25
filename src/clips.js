const CLIP_PLACEHOLDER_SHOW_TIME = 3000;

const clipWrapper = document.querySelector('.clip-wrapper');
const clipFrame = document.querySelector('.clip-frame');
const clipTitle = document.querySelector('.clip-title');
const clipStats = document.querySelector('.clip-stats');

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

    clipTitle.textContent = clip.title || 'CLIP DATA LOADED';
    clipStats.textContent = formatClipStats(clip);
    setClipPreview(clip);
    clipWrapper.classList.add('show');

    await clipDelay(CLIP_PLACEHOLDER_SHOW_TIME);
    await hideClip();
}

async function hideClip() {
    clipWrapper?.classList.remove('show');
    await clipDelay(500);
    clearClipPreview();
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

function clipDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
