const TWITCH_REQUEST_TIMEOUT = 8000;
const TWITCH_AUTH_STORAGE_KEY = 'badge-on-raid:twitch-auth';
const TWITCH_AUTH_SCOPES = [];

const authPanel = document.querySelector('.auth-panel');
const authStatus = document.querySelector('.auth-panel__status');
const authLink = document.querySelector('.auth-panel__link');
const authUrl = document.querySelector('.auth-panel__url');
const authCode = document.querySelector('.auth-panel__code');
const authConnectButton = document.querySelector('.auth-panel__connect');
const authResetButton = document.querySelector('.auth-panel__reset');

let twitchAuth = loadTwitchAuth();
let devicePollAbort = null;
let authCallbacks = {
    onAuthorized: null,
    onReset: null
};

function initTwitchAuthorization(callbacks = {}) {
    authCallbacks = {
        onAuthorized: callbacks.onAuthorized || null,
        onReset: callbacks.onReset || null
    };

    authConnectButton?.addEventListener('click', () => {
        startDeviceAuthorization().catch(error => showAuthPanel(`Ошибка авторизации: ${error.message}`, true));
    });

    authResetButton?.addEventListener('click', () => {
        resetAuth();
        showAuthPanel('Токен сброшен. Нажми "Подключить Twitch", чтобы авторизоваться заново.');
    });

    bootTwitchAuthorization().catch(error => showAuthPanel(`Ошибка запуска: ${error.message}`, true));
}

async function bootTwitchAuthorization() {
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
    await authCallbacks.onAuthorized?.();
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
    await bootTwitchAuthorization();
}

async function pollDeviceToken(device, signal) {
    const startedAt = Date.now();
    let intervalMs = Math.max(5, Number(device.interval) || 5) * 1000;

    while (Date.now() - startedAt < Number(device.expires_in || 0) * 1000) {
        await authDelay(intervalMs, signal);

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

function resetAuth(options = {}) {
    if (devicePollAbort) {
        devicePollAbort.abort();
        devicePollAbort = null;
    }

    twitchAuth = null;
    localStorage.removeItem(TWITCH_AUTH_STORAGE_KEY);
    localStorage.removeItem('twitch_token');
    authCallbacks.onReset?.();

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

function toFormBody(values) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, value);
        }
    });
    return params;
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

function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}

function authDelay(ms, signal) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, ms);

        signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}
