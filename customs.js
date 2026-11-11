/*
 * Lampa Customs (customs.js)
 * 1. Стрічка трейлерів: TMDB (UA, RU, EN) + YouTube резерв (відразу під обкладинкою).
 * 2. Filmix швидкий перегляд: доступні варіанти озвучки, якість (4K/1080p/720p), орієнтовний розмір файлу та прямий запуск.
 * 3. Торренти (TorrServer): окрема кнопка у меню «Джерело», повноекранний список Cinema Glass, сортування за вагою ⬇️/⬆️, швидкі фільтри (4K/1080p/UKR), живий вимір швидкості TorrServer відносно бітрейту.
 * Сумісність з ES5 для телевізорів (Tizen, webOS, Android TV).
 */
(function () {
    'use strict';

    var PLUGIN_VERSION = '1.5.5';
    var PLUGIN_BUILD = '11.11 16:40';
    window.lampa_customs_plugin = PLUGIN_VERSION;

    // Вбудований активатор можливостей TorrServer (аналог etor / cub.rip/plugin/etor)
    // Знімає обмеження «demo mode» на Smart TV (LG webOS, Samsung Tizen) та активує нативні торренти Lampa
    try {
        if (!window.lampa_settings) window.lampa_settings = {};
        window.lampa_settings.torrents_use = true;
        window.lampa_settings.demo = false;
        window.lampa_settings.read_only = false;
    } catch (eSettings) {}

    var COMPONENT_NAME = 'lampa_customs';
    var ROW_TRAILERS = 'customs_trailers';
    var ROW_FILMIX = 'customs_filmix';
    var ROW_TORRENTS = 'customs_torrents';

    var CACHE_KEY = 'ua_trailers_cache_v3';
    var CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
    var CACHE_LIMIT = 300;

    var CYRILLIC = /[а-яёіїєґ]/i;
    var UA_WORDS = /[іїєґ]|(?:\b|_)(?:ua|ukr|ukrainian)(?:\b|_)|укр|україн|\+ua/i;

    function isUkrainian(title) {
        return UA_WORDS.test(title);
    }

    var LANG_ORDER = ['uk', 'ru', 'en'];

    var LANGS = {
        uk: {
            badge: 'UA',
            name: 'Українська',
            rowTitle: 'Трейлери українською',
            defaultOn: true,
            query: 'трейлер українською',
            relevance: 'uk',
            region: 'UA',
            trailerWords: /трейлер|тизер|trailer|teaser/i,
            matches: isUkrainian
        },
        ru: {
            badge: 'RU',
            name: 'Російська',
            rowTitle: 'Трейлери російською',
            defaultOn: false,
            query: 'трейлер на русском',
            relevance: 'ru',
            region: '',
            trailerWords: /трейлер|тизер/i,
            matches: function (title) { return CYRILLIC.test(title) && !isUkrainian(title); }
        },
        en: {
            badge: 'EN',
            name: 'Англійська',
            rowTitle: 'Трейлери англійською',
            defaultOn: false,
            query: 'official trailer',
            relevance: 'en',
            region: 'US',
            trailerWords: /trailer|teaser/i,
            matches: function (title) { return !CYRILLIC.test(title); }
        }
    };

    // ---------- Налаштування Lampa Customs ----------

    function flag(name, def) {
        var v = Lampa.Storage.get(name, def);
        return v === true || v === 'true';
    }

    function enabledLangs() {
        return LANG_ORDER.filter(function (lang) {
            return flag('ua_trailers_lang_' + lang, LANGS[lang].defaultOn);
        });
    }

    function youtubeKey() {
        if (!flag('ua_trailers_youtube', true)) return '';
        return (Lampa.Storage.get('ua_trailers_yt_key', '') + '').trim();
    }

    // ---------- Головна сторінка: горизонтальні смужки ----------

    var MAIN_STRIPS = [
        { id: 'popular_movie', name: 'Популярні фільми', keywords: ['популярні фільми', 'популярные фильмы', 'popular movie'] },
        { id: 'popular_tv', name: 'Популярні серіали', keywords: ['популярні серіали', 'популярные сериалы', 'popular tv', 'popular show'] },
        { id: 'now_watch', name: 'Зараз дивляться', keywords: ['зараз дивляться', 'сейчас смотрят', 'now watch', 'now playing'] },
        { id: 'trend_day', name: 'В тренді за день', keywords: ['в тренді за день', 'в тренде за день', 'trending day', 'trend day'] },
        { id: 'trend_week', name: 'В тренді за тиждень', keywords: ['в тренді за тиждень', 'в тренде за неделю', 'trending week', 'trend week'] },
        { id: 'top_movie', name: 'Кращі фільми', keywords: ['кращі фільми', 'лучшие фильмы', 'top movie', 'top rated movie'] },
        { id: 'top_tv', name: 'Кращі серіали', keywords: ['кращі серіали', 'лучшие сериалы', 'top tv', 'top rated tv'] },
        { id: 'upcoming', name: 'Очікувані / Скоро', keywords: ['очікувані', 'ожидаемые', 'скоро', 'upcoming'] },
        { id: 'history_continue', name: 'Продовжити перегляд', keywords: ['продовжити', 'продолжить', 'історія', 'история', 'history'] },
        { id: 'bookmarks', name: 'Закладки', keywords: ['закладки', 'bookmarks', 'закладка'] },
        { id: 'genres', name: 'Жанрові добірки', keywords: ['жанр', 'комеді', 'комеди', 'бойовик', 'боевик', 'трилер', 'триллер', 'драм', 'фантастик', 'мультфільм', 'мультфильм', 'аніме', 'аниме'] }
    ];

    function getStripId(title) {
        if (!title) return 'other';
        var lower = (title + '').toLowerCase();
        for (var i = 0; i < MAIN_STRIPS.length; i++) {
            var s = MAIN_STRIPS[i];
            for (var j = 0; j < s.keywords.length; j++) {
                if (lower.indexOf(s.keywords[j]) !== -1) return s.id;
            }
        }
        return 'other';
    }

    function getMainStripsDefaultOrder() {
        return MAIN_STRIPS.map(function (s) { return s.id; });
    }

    function getMainStripsOrder() {
        var def = getMainStripsDefaultOrder();
        var saved = (Lampa.Storage && Lampa.Storage.get) ? Lampa.Storage.get('customs_main_strips_order', def) : def;
        if (!Array.isArray(saved) || !saved.length) return def;
        def.forEach(function (sid) {
            if (saved.indexOf(sid) === -1) saved.push(sid);
        });
        return saved;
    }

    function isStripVisible(stripId) {
        if (!flag('customs_main_strips_filter_enabled', true)) return true;
        if (stripId === 'other') return true;
        return flag('customs_strip_' + stripId, true);
    }

    function openStripsOrderDialog() {
        var order = getMainStripsOrder();
        var menu = order.map(function (sid, idx) {
            var stripInfo = null;
            for (var i = 0; i < MAIN_STRIPS.length; i++) {
                if (MAIN_STRIPS[i].id === sid) { stripInfo = MAIN_STRIPS[i]; break; }
            }
            var title = stripInfo ? stripInfo.name : sid;
            var vis = isStripVisible(sid);
            return {
                title: (idx + 1) + '. ' + title + (vis ? '' : ' (Приховано)'),
                id: sid,
                index: idx
            };
        });

        Lampa.Select.show({
            title: 'Порядок смужок (виберіть рядок)',
            items: menu,
            onBack: function () {
                Lampa.Controller.toggle('settings');
            },
            onSelect: function (selectedItem) {
                var sid = selectedItem.id;
                var stripInfo = null;
                for (var i = 0; i < MAIN_STRIPS.length; i++) {
                    if (MAIN_STRIPS[i].id === sid) { stripInfo = MAIN_STRIPS[i]; break; }
                }
                var name = stripInfo ? stripInfo.name : sid;
                var isVis = isStripVisible(sid);

                var actions = [
                    { title: '⬆️ Підняти вище', action: 'up' },
                    { title: '⬇️ Опустити нижче', action: 'down' },
                    { title: '🔝 Перемістити на 1-ше місце', action: 'top' },
                    { title: '🔻 Перемістити в кінець', action: 'bottom' },
                    { title: isVis ? '👁️ Приховати смужку' : '✅ Показувати смужку', action: 'toggle_vis' }
                ];

                Lampa.Select.show({
                    title: name,
                    items: actions,
                    onBack: function () {
                        openStripsOrderDialog();
                    },
                    onSelect: function (act) {
                        var currOrder = getMainStripsOrder().slice();
                        var pos = currOrder.indexOf(sid);
                        if (pos !== -1) {
                            if (act.action === 'up' && pos > 0) {
                                var tmp = currOrder[pos - 1];
                                currOrder[pos - 1] = currOrder[pos];
                                currOrder[pos] = tmp;
                            } else if (act.action === 'down' && pos < currOrder.length - 1) {
                                var tmp = currOrder[pos + 1];
                                currOrder[pos + 1] = currOrder[pos];
                                currOrder[pos] = tmp;
                            } else if (act.action === 'top') {
                                currOrder.splice(pos, 1);
                                currOrder.unshift(sid);
                            } else if (act.action === 'bottom') {
                                currOrder.splice(pos, 1);
                                currOrder.push(sid);
                            } else if (act.action === 'toggle_vis') {
                                var currentFlag = isStripVisible(sid);
                                Lampa.Storage.set('customs_strip_' + sid, !currentFlag);
                            }
                            Lampa.Storage.set('customs_main_strips_order', currOrder);
                        }
                        openStripsOrderDialog();
                    }
                });
            }
        });
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: COMPONENT_NAME,
            name: 'Lampa Customs v' + PLUGIN_VERSION,
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>'
        });

        // Статус версії плагіна
        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_title_version_status', type: 'title' },
            field: { name: '⚡️ Версія: v' + PLUGIN_VERSION + ' (' + PLUGIN_BUILD + ')' }
        });

        // Розділ: Трейлери
        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_title_trailers', type: 'title' },
            field: { name: 'Стрічка трейлерів' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_trailers_enabled', type: 'trigger', default: true },
            field: { name: 'Увімкнути трейлери', description: 'Стрічка трейлерів під обкладинкою з TMDB та YouTube' }
        });

        LANG_ORDER.forEach(function (lang) {
            Lampa.SettingsApi.addParam({
                component: COMPONENT_NAME,
                param: { name: 'ua_trailers_lang_' + lang, type: 'trigger', default: LANGS[lang].defaultOn },
                field: { name: 'Трейлери: ' + LANGS[lang].name }
            });
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'ua_trailers_youtube', type: 'trigger', default: true },
            field: { name: 'Шукати резерв на YouTube', description: 'Якщо в TMDB немає трейлера вибраною мовою' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'ua_trailers_yt_key', type: 'input', values: '', default: '', placeholder: 'AIza…' },
            field: { name: 'Ключ YouTube Data API', description: 'console.cloud.google.com → YouTube Data API v3' },
            onChange: function () {
                Lampa.Storage.set(CACHE_KEY, {});
            }
        });

        // Розділ: Filmix швидкий перегляд
        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_title_filmix', type: 'title' },
            field: { name: 'Filmix (Швидкий перегляд)' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_filmix_enabled', type: 'trigger', default: true },
            field: { name: 'Стрічка відео Filmix', description: 'Показувати доступні відео під постером з озвучкою та якістю' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_filmix_show_size', type: 'trigger', default: true },
            field: { name: 'Показувати розмір файлу', description: 'Розраховувати орієнтовний обсяг за бітрейтом і тривалістю' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'customs_filmix_series_style',
                type: 'select',
                values: {
                    cinema: 'Apple TV Cinema (кадр зверху)',
                    backdrop: 'Glass Backdrop (кадр фоном)',
                    horizontal: 'Horizontal Split (кадр зліва)'
                },
                default: 'cinema'
            },
            field: {
                name: 'Стиль карток серій',
                description: 'Виберіть вигляд карток серій із кадрами та назвами'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'customs_filmix_theme',
                type: 'select',
                values: {
                    hybrid: 'Гібридний (Білі кнопки + Скляні картки)',
                    glass: 'Скло Apple TV (Frosted Glass)',
                    lampa: 'Нативний Lampa (Clean White)'
                },
                default: 'hybrid'
            },
            field: {
                name: 'Тема оформлення (кнопки та картки)',
                description: 'Виберіть візуальний стиль: скло, нативний білий або гібрид'
            },
            onChange: function (value) {
                var theme = value || 'hybrid';
                $('.customs-filmix').removeClass('customs-theme-hybrid customs-theme-glass customs-theme-lampa')
                    .addClass('customs-theme-' + theme);
            }
        });

        // Розділ: Торренти (TorrServer Speed & Size)
        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_title_torrents', type: 'title' },
            field: { name: 'Торренти (TorrServer Speed & Size)' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_torrents_enabled', type: 'trigger', default: true },
            field: { name: 'Стрічка торрентів', description: 'Показувати стрічку роздач, відсортованих за вагою з індикатором швидкості' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_torrserver_url', type: 'input', values: '', default: '', placeholder: 'http://127.0.0.1:8090' },
            field: { name: 'Адреса TorrServer', description: 'Залиште порожнім для авто-визначення з налаштувань Lampa' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_parser_url', type: 'input', values: '', default: '', placeholder: 'http://jac.red' },
            field: { name: 'Адреса парсера торрентів', description: 'Залиште порожнім для авто з Lampa або вкажіть JacRed' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'customs_torrserver_test_btn',
                type: 'static'
            },
            field: {
                name: '⚡️ Перевірити зв\'язок з TorrServer',
                description: 'Натисніть для перевірки доступності торрент-сервера'
            },
            onRender: function (item) {
                item.on('hover:enter', function () {
                    var u = getTorrServerUrl();
                    var net = new Lampa.Reguest();
                    net.timeout(5000);
                    var textParams = { dataType: 'text' };

                    Lampa.Loading.start(function () {});

                    function reportSuccess(msg) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show(msg || ('🟢 TorrServer доступний: ' + u));
                    }

                    function reportFail() {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('🔴 Немає зв\'язку з TorrServer (' + u + ')');
                    }

                    // 1. Якщо це нативний сервер Lampa (без кастомного URL) - пробуємо рідний Lampa.Torserver.connected
                    if (!Lampa.Storage.get('customs_torrserver_url') && Lampa.Torserver && Lampa.Torserver.connected) {
                        Lampa.Torserver.connected(function () {
                            reportSuccess();
                        }, function () {
                            testHttp();
                        });
                    } else {
                        testHttp();
                    }

                    function testHttp() {
                        // Тест 1: GET / з dataType text через native (як у рідних налаштуваннях Lampa)
                        var rootUrl = u.replace(/\/+$/, '') + '/';
                        sendTorrReq(net, rootUrl, function () {
                            reportSuccess();
                        }, function (a) {
                            if (a && a.status === 401) {
                                reportSuccess('🟢 TorrServer доступний (потрібна авторизація): ' + u);
                            } else {
                                // Тест 2: POST /settings action: get (офіційне API MatriX)
                                sendTorrReq(net, u.replace(/\/+$/, '') + '/settings', function (res) {
                                    reportSuccess();
                                }, function () {
                                    // Тест 3: GET /echo
                                    sendTorrReq(net, u.replace(/\/+$/, '') + '/echo', function () {
                                        reportSuccess();
                                    }, function () {
                                        reportFail();
                                    }, false, textParams);
                                }, JSON.stringify({ action: 'get' }), textParams);
                            }
                        }, false, textParams);
                    }
                });
            }
        });

        // Розділ: Головна сторінка (горизонтальні смужки)
        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_title_main_strips', type: 'title' },
            field: { name: 'Головна сторінка (Смужки контенту)' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_main_strips_filter_enabled', type: 'trigger', default: true },
            field: { name: 'Керування смужками', description: 'Увімкнути сортування та приховування смужок на головному екрані' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'customs_main_order_btn',
                type: 'static'
            },
            field: {
                name: 'Порядок відображення смужок',
                description: 'Натисніть для зміни черговості рядків або підняття на 1-ше місце'
            },
            onRender: function (item) {
                item.on('hover:enter', function () {
                    openStripsOrderDialog();
                });
            }
        });

        MAIN_STRIPS.forEach(function (s) {
            Lampa.SettingsApi.addParam({
                component: COMPONENT_NAME,
                param: { name: 'customs_strip_' + s.id, type: 'trigger', default: true },
                field: { name: 'Показувати «' + s.name + '»' }
            });
        });
    }

    // Реєстрація маніфесту та відображення назви "Lampa Customs"
    function registerManifestAndName() {
        var manifest = {
            type: 'video',
            version: PLUGIN_VERSION,
            name: 'Lampa Customs v' + PLUGIN_VERSION,
            description: 'Трейлери та швидкий перегляд Filmix',
            component: COMPONENT_NAME
        };

        if (Array.isArray(Lampa.Manifest.plugins)) {
            var exists = Lampa.Manifest.plugins.some(function (p) { return p.component === COMPONENT_NAME; });
            if (!exists) Lampa.Manifest.plugins.push(manifest);
        } else if (Lampa.Manifest.plugins) {
            Lampa.Manifest.plugins[COMPONENT_NAME] = manifest;
        } else {
            Lampa.Manifest.plugins = [manifest];
        }

        try {
            var plugins = Lampa.Storage.get('plugins', []);
            var changed = false;
            plugins.forEach(function (p) {
                if (p && p.url && (p.url.indexOf('customs') !== -1 || p.url.indexOf('lampacustoms') !== -1 || p.url.indexOf('trailers') !== -1)) {
                    if (p.name !== 'Lampa Customs') {
                        p.name = 'Lampa Customs';
                        changed = true;
                    }
                }
            });
            if (changed) Lampa.Storage.set('plugins', plugins);
        } catch (e) {}
    }

    // ---------- Кеш YouTube ----------

    function cacheGet(id) {
        var all = Lampa.Storage.get(CACHE_KEY, {});
        var hit = all && all[id];
        return hit && Date.now() - hit.time < CACHE_TTL ? hit.list : null;
    }

    function cacheSet(id, list) {
        var all = Lampa.Storage.get(CACHE_KEY, {});
        if (!all || typeof all !== 'object') all = {};

        all[id] = { time: Date.now(), list: list };

        var ids = Object.keys(all);
        if (ids.length > CACHE_LIMIT) {
            ids.sort(function (a, b) { return all[a].time - all[b].time; });
            ids.slice(0, ids.length - CACHE_LIMIT).forEach(function (old) { delete all[old]; });
        }

        Lampa.Storage.set(CACHE_KEY, all);
    }

    // ---------- Трейлери: Джерела ----------

    function formatDate(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    }

    function fromTmdb(results, lang) {
        var typeOrder = { Trailer: 0, Teaser: 1 };

        return (results || [])
            .filter(function (v) {
                return v.site === 'YouTube' && v.iso_639_1 === lang && v.key && v.type in typeOrder;
            })
            .sort(function (a, b) {
                if (a.type !== b.type) return typeOrder[a.type] - typeOrder[b.type];
                return new Date(b.published_at) - new Date(a.published_at);
            })
            .map(function (v) {
                return {
                    key: v.key,
                    name: v.name,
                    lang: lang,
                    source: 'TMDB',
                    sub: [v.official ? 'Офіційний' : '', formatDate(v.published_at)].filter(Boolean).join(' · ')
                };
            });
    }

    function decodeHtml(text) {
        var t = document.createElement('textarea');
        t.innerHTML = text;
        return t.value;
    }

    var STOP_WORDS = {};
    ('the a an of and or in on at to for with by from part ' +
        'і й та в у на з із зі до від по за для про не що як частина ' +
        'и с со от о об что как часть ' +
        'фільм фильм movie film серіал сериал series')
        .split(' ').forEach(function (w) { STOP_WORDS[w] = true; });

    function words(text) {
        return (text || '').toLowerCase().split(/[^0-9a-zа-яіїєґё]+/i).filter(Boolean);
    }

    function matchesOneTitle(videoWords, title) {
        var significant = words(title).filter(function (w) {
            return !STOP_WORDS[w] && (w.length >= 3 || /^\d+$/.test(w));
        });
        if (!significant.length) return false;

        var found = significant.filter(function (w) {
            var stem = w.length > 5 ? w.slice(0, w.length - 2) : w;
            return videoWords.some(function (vw) {
                return w.length > 5 ? vw.indexOf(stem) === 0 && vw.length <= w.length + 2 : vw === w;
            });
        }).length;

        var need = significant.length <= 2 ? significant.length : Math.ceil(significant.length * 0.7);
        return found >= need;
    }

    function matchesTitle(videoTitle, titles) {
        var videoWords = words(videoTitle);
        return titles.some(function (title) { return matchesOneTitle(videoWords, title); });
    }

    function searchYoutube(network, info, lang, key, done) {
        var cfg = LANGS[lang];
        var q = (info.title || info.original) + (info.year ? ' ' + info.year : '') + ' ' + cfg.query;
        var url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15' +
            '&relevanceLanguage=' + cfg.relevance + (cfg.region ? '&regionCode=' + cfg.region : '') +
            '&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(key);

        network.silent(url, function (json) {
            var list = (json.items || [])
                .map(function (it) {
                    return {
                        key: it.id && it.id.videoId,
                        name: decodeHtml(it.snippet.title || ''),
                        lang: lang,
                        source: 'YouTube',
                        sub: [decodeHtml(it.snippet.channelTitle || ''), formatDate(it.snippet.publishedAt)].filter(Boolean).join(' · ')
                    };
                })
                .filter(function (v) {
                    return v.key &&
                        cfg.matches(v.name) &&
                        cfg.trailerWords.test(v.name) &&
                        matchesTitle(v.name, [info.title, info.original]);
                })
                .slice(0, 8);

            done(list, true);
        }, function (xhr) {
            console.log('Lampa Customs', 'YouTube error', lang, xhr && xhr.status);
            done([], false);
        });
    }

    function titleFor(json, lang) {
        var original = json.original_title || json.original_name || '';
        if (lang === 'uk') return json.title || json.name || original;

        var list = (json.translations && json.translations.translations) || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].iso_639_1 === lang && list[i].data) {
                var t = list[i].data.title || list[i].data.name;
                if (t) return t;
            }
        }
        return original;
    }

    function loadTrailers(network, method, id, langs, done) {
        var trailersCacheKey = 'customs_tr_' + method + '_' + id + '_' + langs.join('_');
        var cachedTrailers = (Lampa.Storage && Lampa.Storage.cache) ? Lampa.Storage.cache(trailersCacheKey, 1000 * 60 * 60 * 12) : null;
        if (cachedTrailers && Array.isArray(cachedTrailers) && cachedTrailers.length) {
            return done(cachedTrailers);
        }

        var path = method + '/' + id + '?language=uk-UA&append_to_response=videos,translations' +
            '&include_video_language=' + langs.join(',') + '&api_key=' + Lampa.TMDB.key();

        network.silent(Lampa.TMDB.api(path), function (json) {
            var results = json.videos && json.videos.results;
            var key = youtubeKey();
            var byLang = {};
            var pending = 0;

            function finish() {
                if (pending > 0) return;
                var all = [];
                langs.forEach(function (lang) { all = all.concat(byLang[lang] || []); });
                if (all.length && Lampa.Storage && Lampa.Storage.set) {
                    Lampa.Storage.set(trailersCacheKey, all);
                }
                done(all);
            }

            langs.forEach(function (lang) {
                byLang[lang] = fromTmdb(results, lang);
            });

            var tmdbFound = langs.some(function (lang) { return byLang[lang].length; });

            if (!tmdbFound && key) langs.forEach(function (lang) {
                var cacheId = method + '_' + id + '_' + lang;
                var cached = cacheGet(cacheId);
                if (cached) {
                    byLang[lang] = cached;
                    return;
                }

                pending++;
                searchYoutube(network, {
                    title: titleFor(json, lang),
                    original: json.original_title || json.original_name,
                    year: ((json.release_date || json.first_air_date || '') + '').slice(0, 4)
                }, lang, key, function (found, ok) {
                    if (ok) cacheSet(cacheId, found);
                    byLang[lang] = found;
                    pending--;
                    finish();
                });
            });

            finish();
        }, function () {
            done([]);
        });
    }

    function playTrailer(item, playlist) {
        if (Lampa.Platform.is('android') && Lampa.Storage.field('player_launch_trailers') == 'youtube') {
            Lampa.Android.openYoutube(item.id);
            return;
        }

        Lampa.Player.play(item);
        Lampa.Player.playlist(playlist);
    }

    function createTrailersRow(list, langs) {
        var row = new Lampa.Emit();
        var title = langs.length === 1 ? LANGS[langs[0]].rowTitle : 'Трейлери';
        var html = Lampa.Template.get('items_line', { title: title });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 300 });
        var last = null;

        var playlist = list.map(function (v) {
            return { title: v.name, url: 'https://www.youtube.com/watch?v=' + v.key, youtube: true, id: v.key };
        });

        html.addClass('ua-trailers');

        list.forEach(function (v, i) {
            var el = $('<div class="ua-trailer selector">' +
                '<div class="ua-trailer__img"><img alt=""><div class="ua-trailer__lang"></div></div>' +
                '<div class="ua-trailer__title"></div>' +
                '<div class="ua-trailer__sub"><span class="ua-trailer__source"></span><span class="ua-trailer__meta"></span></div>' +
                '</div>');

            el.find('img').on('error', function () { $(this).remove(); })
                .attr('src', 'https://img.youtube.com/vi/' + v.key + '/mqdefault.jpg');
            el.find('.ua-trailer__lang').text(LANGS[v.lang] ? LANGS[v.lang].badge : '');
            el.find('.ua-trailer__title').text(v.name);
            el.find('.ua-trailer__source').text(v.source).addClass('ua-trailer__source--' + (v.source || '').toLowerCase());
            el.find('.ua-trailer__meta').text(v.sub ? ' · ' + v.sub : '');

            el.on('hover:focus', function () {
                last = el[0];
                scroll.update(el, true);
            });
            el.on('hover:enter', function () {
                last = el[0];
                row.toggle();
                playTrailer(playlist[i], playlist);
            });

            scroll.append(el[0]);
        });

        html.find('.items-line__body').append(scroll.render(true));

        row.create = function () {};
        row.render = function (js) { return js ? html[0] : html; };

        row.toggle = function () {
            Lampa.Controller.add(ROW_TRAILERS, {
                link: row,
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(true));
                    Lampa.Controller.collectionFocus(last || false, scroll.render(true));
                    row.emit('active');
                    row.emit('toggle');
                },
                update: function () {},
                right: function () { Navigator.move('right'); },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else row.emit('left');
                },
                down: function () { row.emit('down'); },
                up: function () { row.emit('up'); },
                back: function () { row.emit('back'); }
            });

            Lampa.Controller.toggle(ROW_TRAILERS);
        };

        row.destroy = function () {
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    // ---------- Filmix: Швидкий перегляд ----------

    function cleanTitle(str) {
        return (str || '').replace(/[\s.,:;’'`!?]+/g, ' ').trim();
    }

    function getStreamBitrate(quality) {
        var q = parseInt(quality) || 1080;
        if (q >= 2160) return 20000;
        if (q >= 1440) return 11000;
        if (q >= 1080) return 5500;
        if (q >= 720) return 2400;
        return 1200;
    }

    function calculateSizeBytes(quality, runtimeMinutes) {
        var bitrate = getStreamBitrate(quality);
        var minutes = runtimeMinutes || 115;
        return (bitrate * (minutes * 60)) / (8 * 1024);
    }

    function formatSize(sizeMB) {
        if (!sizeMB || sizeMB <= 0) return '';
        if (sizeMB >= 1024) return (sizeMB / 1024).toFixed(1) + ' ГБ';
        return Math.round(sizeMB) + ' МБ';
    }

    function fixStreamUrl(url) {
        if (!url) return '';
        var u = url;
        if (u.indexOf('//') === 0) {
            u = (window.location && window.location.protocol === 'https:' ? 'https:' : 'http:') + u;
        } else if (window.location && window.location.protocol === 'https:' && u.indexOf('http://') === 0) {
            u = u.replace('http://', 'https://');
        }
        return u;
    }

    function randomHex(len) {
        var chars = '0123456789abcdef';
        var res = '';
        for (var i = 0; i < len; i++) {
            res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return res;
    }

    function getFilmixMaxQuality() {
        var status = {};
        try {
            var raw = (Lampa.Storage && Lampa.Storage.get) ? Lampa.Storage.get('filmix_status', '{}') : '{}';
            status = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        } catch (e) {
            status = {};
        }

        if (status && status.is_pro_plus) return 2160;
        if (status && status.is_pro) return 1080;
        if (window.mod_filmix && window.mod_filmix.max_qualitie) {
            return window.mod_filmix.max_qualitie;
        }
        var token = (Lampa.Storage && Lampa.Storage.get) ? (Lampa.Storage.get('filmix_token', '') + '') : '';
        if (token) return 1080; // Безпечний ліміт для Filmix PRO (1080p, захист від 404 на 4K)
        return 720;
    }

    // Точний формат проксі Cloudflare Worker, як у online_mod
    function proxyFilmixUrl(link) {
        if (Lampa.Platform.is('android')) return link;
        var proxy = 'https://cors.nb557.workers.dev/';
        var proxy_enc = 'param/User-Agent=' + encodeURIComponent('okhttp/3.10.0') + '/';
        var b64 = btoa(proxy_enc + link);
        var posEnd = link.lastIndexOf('?');
        var posStart = link.lastIndexOf('://');
        if (posEnd === -1 || posEnd <= posStart) posEnd = link.length;
        if (posStart === -1) posStart = -3;
        var name = link.substring(posStart + 3, posEnd);
        posStart = name.lastIndexOf('/');
        name = posStart !== -1 ? name.substring(posStart + 1) : 'api';
        return proxy + 'enc2/' + encodeURIComponent(b64) + '/' + name + '?jacred.test';
    }

    // Очищення застарілих кешів посилань Filmix з localStorage (підписані CDN-посилання швидко стають недійсними)
    try {
        if (typeof localStorage !== 'undefined') {
            var keysToRemove = [];
            for (var ki = 0; ki < localStorage.length; ki++) {
                var kName = localStorage.key(ki);
                if (kName && (kName.indexOf('customs_filmix_v') === 0 || (kName.indexOf('customs_filmix_') === 0 &&
                    kName.indexOf('customs_filmix_series_') === -1 &&
                    kName.indexOf('customs_filmix_enabled') === -1 &&
                    kName.indexOf('customs_filmix_show_size') === -1 &&
                    kName.indexOf('customs_filmix_theme') === -1 &&
                    kName.indexOf('customs_filmix_series_style') === -1 &&
                    kName.indexOf('customs_filmix_last_quality') === -1))) {
                    keysToRemove.push(kName);
                }
            }
            keysToRemove.forEach(function (k) {
                try { localStorage.removeItem(k); } catch (e) {}
            });
        }
    } catch (e) {}

    var filmixMemoryCache = {};
    var FILM_CACHE_TTL = 1000 * 60 * 15; // 15 хв тільки у пам'яті поточної сесії

    function getFilmixCacheKey(movieId) {
        var token = (Lampa.Storage && Lampa.Storage.get) ? (Lampa.Storage.get('filmix_token', '') + '') : '';
        var tokenHash = token ? token.substring(0, 8) : 'guest';
        return 'customs_filmix_mem_' + tokenHash + '_' + movieId;
    }

    function getFilmixCache(movieId) {
        if (!movieId) return null;
        var key = getFilmixCacheKey(movieId);
        var entry = filmixMemoryCache[key];
        if (entry && entry.time && (Date.now() - entry.time < FILM_CACHE_TTL)) {
            return entry.data;
        }
        return null;
    }

    function setFilmixCache(movieId, data) {
        if (!movieId || !data) return;
        var key = getFilmixCacheKey(movieId);
        filmixMemoryCache[key] = {
            time: Date.now(),
            data: data
        };
    }

    function searchFilmix(movie, done) {
        var cached = getFilmixCache(movie.id);
        if (cached) {
            return done(cached);
        }

        var token = (Lampa.Storage && Lampa.Storage.get) ? (Lampa.Storage.get('filmix_token', '') + '') : '';
        var dev_id = randomHex(16);
        var dev_token = '?user_dev_id=' + dev_id + '&user_dev_name=Xiaomi&user_dev_token=' + (token || 'aaaabbbbccccddddeeeeffffaaaabbbb') + '&user_dev_vendor=Xiaomi&user_dev_os=14&user_dev_apk=2.2.0&app_lang=ru-rRU';

        var title1 = cleanTitle(movie.title || movie.name);
        var title2 = cleanTitle(movie.original_title || movie.original_name);

        function querySearch(searchWord, callback) {
            if (!searchWord) return callback([]);
            var searchUrl = 'http://filmixapp.cyou/api/v2/search' + dev_token + '&story=' + encodeURIComponent(searchWord);
            var req = new Lampa.Reguest();
            req.timeout(12000);
            req.native(proxyFilmixUrl(searchUrl), function (resp) {
                var json = resp;
                if (typeof json === 'string') {
                    try { json = JSON.parse(json); } catch (e) { json = null; }
                }
                callback(Array.isArray(json) ? json : []);
            }, function () {
                callback([]);
            });
        }

        querySearch(title1, function (list) {
            if (list.length) {
                selectAndLoadPost(list, dev_token, movie, done);
            } else if (title2 && title2 !== title1) {
                querySearch(title2, function (list2) {
                    if (list2.length) {
                        selectAndLoadPost(list2, dev_token, movie, done);
                    } else {
                        done([]);
                    }
                });
            } else {
                done([]);
            }
        });
    }

    function selectAndLoadPost(list, dev_token, movie, done) {
        var target = list[0];
        var searchYear = parseInt(((movie.release_date || movie.first_air_date || '') + '').slice(0, 4));
        if (list.length > 1 && searchYear) {
            var byYear = list.filter(function (c) { return c.year === searchYear; });
            if (byYear.length) target = byYear[0];
            else {
                var nearYear = list.filter(function (c) { return c.year && Math.abs(c.year - searchYear) <= 1; });
                if (nearYear.length) target = nearYear[0];
            }
        }
        if (target && target.id) {
            loadFilmixPost(target.id, dev_token, movie, done);
        } else {
            done([]);
        }
    }

    function loadFilmixPost(id, dev_token, movie, done) {
        var postUrl = 'http://filmixapp.cyou/api/v2/post/' + id + dev_token;
        var req = new Lampa.Reguest();
        req.timeout(12000);
        req.native(proxyFilmixUrl(postUrl), function (resp) {
            var data = resp;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { data = null; }
            }
            var maxQ = getFilmixMaxQuality();
            var showSize = flag('customs_filmix_show_size', true);
            var runtime = parseInt(movie.runtime) || ((movie.episode_run_time && movie.episode_run_time[0]) ? parseInt(movie.episode_run_time[0]) : (movie.number_of_seasons ? 45 : 115));
            var seen = {};

            if (data && data.player_links) {
                var pl = data.player_links;
                if (pl.movie && pl.movie.length) {
                    // Фільми: доступні переклади та варіанти якості
                    var streams = [];
                    pl.movie.forEach(function (item) {
                        if (!item || !item.link || item.translation === 'Заблокировано правообладателем!') return;

                        var m = item.link.match(/\[([\d,]*)\]/);
                        var qualities = [];
                        if (m) {
                            qualities = m[1].split(',').map(function (s) { return parseInt(s); }).filter(function (n) { return !isNaN(n) && n > 0 && n <= maxQ; });
                            qualities.sort(function (a, b) { return b - a; });
                        }

                        if (!qualities.length) {
                            var qm = item.link.match(/(?:_|\/)(2160|1440|1080|720|480)(?:p|v|\.mp4)/i);
                            if (qm) qualities = [parseInt(qm[1])].filter(function (n) { return n <= maxQ; });
                            else qualities = [Math.min(720, maxQ)];
                        }

                        var highQ = qualities.filter(function (q) { return q >= 720; });
                        var finalQualities = highQ.length ? highQ : qualities;

                        var qualityMap = {};
                        finalQualities.forEach(function (q) {
                            var qUrl = m ? item.link.replace(/\[[\d,]*\]/i, q) : (item.link.indexOf('%s') !== -1 ? item.link.replace(/%s/i, q) : item.link);
                            qualityMap['\u200B' + (q >= 2160 ? '4K UHD' : q + 'p')] = fixStreamUrl(qUrl);
                        });

                        finalQualities.forEach(function (q) {
                            var voice = item.translation || 'Оригінал / Дубляж';
                            var key = voice + '_' + q;
                            if (seen[key]) return;
                            seen[key] = true;

                            var playUrl = m ? item.link.replace(/\[[\d,]*\]/i, q) : (item.link.indexOf('%s') !== -1 ? item.link.replace(/%s/i, q) : item.link);
                            playUrl = fixStreamUrl(playUrl);
                            var meta = parseStreamMetadata(voice, playUrl, q);

                            streams.push({
                                voice: voice,
                                meta: meta,
                                quality: q >= 2160 ? '4K UHD' : q + 'p',
                                raw_quality: q,
                                url: playUrl,
                                qualityMap: qualityMap
                            });
                        });
                    });

                    // Сортування: від найкращої якості з пріоритетом на українську мову
                    streams.sort(function (a, b) {
                        // 1. Роздільна здатність (2160 -> 1440 -> 1080 -> 720 -> 480)
                        if (b.raw_quality !== a.raw_quality) return b.raw_quality - a.raw_quality;

                        // 2. Усередині тієї ж якості: український дубляж/озвучення першими
                        var aUa = isUkrainian(a.voice) ? 1 : 0;
                        var bUa = isUkrainian(b.voice) ? 1 : 0;
                        if (bUa !== aUa) return bUa - aUa;

                        // 3. HDR / Dolby Vision вище SDR
                        var aHdr = (a.meta && (a.meta.color === 'DV' || a.meta.color === 'HDR10+' || a.meta.color === 'HDR')) ? 1 : 0;
                        var bHdr = (b.meta && (b.meta.color === 'DV' || b.meta.color === 'HDR10+' || b.meta.color === 'HDR')) ? 1 : 0;
                        if (bHdr !== aHdr) return bHdr - aHdr;

                        // 4. Багатоканальний звук (5.1 CH / ATMOS) вище звичайного
                        var aAudio = (a.meta && (a.meta.audio === 'ATMOS' || a.meta.audio === '5.1 CH')) ? 1 : 0;
                        var bAudio = (b.meta && (b.meta.audio === 'ATMOS' || b.meta.audio === '5.1 CH')) ? 1 : 0;
                        if (bAudio !== aAudio) return bAudio - aAudio;

                        return (a.voice || '').localeCompare(b.voice || '');
                    });

                    var resMovie = {
                        isSeries: false,
                        streams: streams
                    };
                    setFilmixCache(movie.id, resMovie);
                    done(resMovie);
                    return;
                } else if (pl.playlist && Object.keys(pl.playlist).length > 0) {
                    // Серіали: повна ієрархія (сезони -> озвучення -> серії -> якості)
                    var seasons = [];
                    var sKeys = Object.keys(pl.playlist).filter(function (k) {
                        var n = parseInt(k) || parseInt((k + '').replace(/\D+/g, '')) || 0;
                        return n > 0;
                    });
                    sKeys.sort(function (a, b) {
                        var na = parseInt(a) || parseInt((a + '').replace(/\D+/g, '')) || 0;
                        var nb = parseInt(b) || parseInt((b + '').replace(/\D+/g, '')) || 0;
                        return na - nb;
                    });

                    var seasNum = 0;
                    sKeys.forEach(function (sKey) {
                        var seasonObj = pl.playlist[sKey];
                        if (!seasonObj || typeof seasonObj !== 'object') return;

                        seasNum++;
                        var sId = parseInt(sKey) || parseInt((sKey + '').replace(/\D+/g, '')) || seasNum;
                        var voices = [];
                        var vKeys = Object.keys(seasonObj);

                        // Пріоритет української озвучки, далі за алфавітом
                        vKeys.sort(function (a, b) {
                            var aUa = isUkrainian(a) ? 1 : 0;
                            var bUa = isUkrainian(b) ? 1 : 0;
                            if (bUa !== aUa) return bUa - aUa;
                            return (a || '').localeCompare(b || '');
                        });

                        vKeys.forEach(function (vKey) {
                            var epObj = seasonObj[vKey];
                            if (!epObj || typeof epObj !== 'object') return;

                            var epKeys = Object.keys(epObj);
                            epKeys.sort(function (a, b) {
                                var na = parseInt(a) || parseInt((a + '').replace(/\D+/g, '')) || 0;
                                var nb = parseInt(b) || parseInt((b + '').replace(/\D+/g, '')) || 0;
                                return na - nb;
                            });

                            var episodes = [];
                            var allQualities = {};
                            var epNum = 0;

                            epKeys.forEach(function (eKey) {
                                var file = epObj[eKey];
                                if (!file) return;

                                epNum++;
                                var eId = parseInt(eKey) || parseInt((eKey + '').replace(/\D+/g, '')) || epNum;
                                var link = '';
                                var qList = [];

                                if (typeof file === 'string') {
                                    link = file;
                                    qList = [720];
                                } else if (typeof file === 'object') {
                                    link = file.link || '';
                                    qList = (file.qualities || []).filter(function (q) {
                                        return !isNaN(q) && q > 0 && q <= maxQ;
                                    });
                                }

                                if (!link) return;

                                if (!qList.length) {
                                    var qm = link.match(/(?:_|\/)(2160|1440|1080|720|480)(?:p|v|\.mp4)/i);
                                    if (qm) qList = [parseInt(qm[1])];
                                    else qList = [720];
                                }
                                qList.sort(function (a, b) { return b - a; });

                                qList.forEach(function (q) { allQualities[q] = true; });

                                episodes.push({
                                    season: sId,
                                    episode: eId,
                                    link: link,
                                    qualities: qList
                                });
                            });

                            if (episodes.length) {
                                var sortedQ = Object.keys(allQualities).map(function (n) { return parseInt(n); });
                                sortedQ.sort(function (a, b) { return b - a; });

                                voices.push({
                                    name: vKey,
                                    isUa: isUkrainian(vKey),
                                    qualities: sortedQ.length ? sortedQ : [720],
                                    episodes: episodes
                                });
                            }
                        });

                        if (voices.length) {
                            seasons.push({
                                id: sId,
                                title: 'Сезон ' + sId,
                                voices: voices
                            });
                        }
                    });

                    if (seasons.length) {
                        var resSeries = {
                            isSeries: true,
                            seasons: seasons
                        };
                        setFilmixCache(movie.id, resSeries);
                        done(resSeries);
                        return;
                    }
                }
            }

            done(null);
        }, function () {
            done(null);
        });
    }

    function probeFileSize(url, callback) {
        if (!url || typeof XMLHttpRequest === 'undefined') return;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', fixStreamUrl(url), true);
            xhr.timeout = 3500;
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    var cl = parseInt(xhr.getResponseHeader('Content-Length'));
                    if (cl && cl > 100 * 1024 * 1024) {
                        callback(cl);
                    }
                }
            };
            xhr.send();
        } catch (e) {}
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderTitleWrapHtml(text) {
        var safe = escapeHtml(text);
        return '<div class="customs-filmix-item__title-wrap" title="' + safe + '">' +
            '<div class="customs-filmix-item__title-inner">' +
                '<span class="customs-filmix-item__title-text">' + safe + '</span>' +
                '<span class="customs-filmix-item__title-sep" aria-hidden="true">&bull;</span>' +
                '<span class="customs-filmix-item__title-dup" aria-hidden="true">' + safe + '</span>' +
                '<span class="customs-filmix-item__title-sep" aria-hidden="true">&bull;</span>' +
            '</div>' +
        '</div>';
    }

    function renderVoiceWrapHtml(cleanVoice, rawVoice) {
        var safe = escapeHtml(cleanVoice);
        var safeRaw = escapeHtml(rawVoice || cleanVoice);
        return '<div class="customs-filmix-item__voice-wrap" title="' + safeRaw + '">' +
            '<div class="customs-filmix-item__voice-inner">' +
                '<span class="customs-filmix-item__voice-text">' + safe + '</span>' +
                '<span class="customs-filmix-item__voice-sep" aria-hidden="true">&bull;</span>' +
                '<span class="customs-filmix-item__voice-dup" aria-hidden="true">' + safe + '</span>' +
                '<span class="customs-filmix-item__voice-sep" aria-hidden="true">&bull;</span>' +
            '</div>' +
        '</div>';
    }

    function checkCardMarquee(target) {
        if (!target) return;
        var $el = $(target);
        var items = $el.is('.customs-filmix-item__voice-wrap, .customs-filmix-item__title-wrap') ?
            $el : $el.find('.customs-filmix-item__voice-wrap, .customs-filmix-item__title-wrap');

        items.each(function () {
            var wrap = this;
            var text = wrap.querySelector('.customs-filmix-item__voice-text, .customs-filmix-item__title-text');
            if (!text) return;

            var wrapW = wrap.clientWidth;
            if (wrapW <= 0) return;

            var textW = Math.max(text.offsetWidth || 0, text.scrollWidth || 0);
            if (textW > wrapW) {
                if (wrap.classList) wrap.classList.add('has-marquee');
                else $(wrap).addClass('has-marquee');

                var dist = textW + 24;
                var dur = Math.max(3.5, dist / 30);
                wrap.style.setProperty('--marquee-dur', dur.toFixed(2) + 's');
            } else {
                if (wrap.classList) wrap.classList.remove('has-marquee');
                else $(wrap).removeClass('has-marquee');
                wrap.style.removeProperty('--marquee-dur');
            }
        });
    }

    function applyCardMarquee(target) {
        checkCardMarquee(target);
    }

    function resetCardMarquee(target) {
        // Automatically handled by CSS scoped to .focus and :hover
    }

    function parseStreamMetadata(voice, url, rawQuality) {
        var str = (voice || '') + ' ' + (url || '');

        // 1. Мова
        var isUa = isUkrainian(str);
        var langCode = isUa ? 'UA' : (CYRILLIC.test(str) ? 'RU' : 'EN');
        var langBadge = isUa ? '🇺🇦 UA' : (langCode === 'RU' ? 'RU' : 'EN');
        var langClass = isUa ? 'badge--ua' : (langCode === 'RU' ? 'badge--ru' : 'badge--en');

        // 2. Очищена назва перекладу / студії
        var cleanVoice = voice || 'Оригінал / Дубляж';
        var mBrack = cleanVoice.match(/\[(.*?)\]/);
        if (mBrack) {
            var parts = mBrack[1].split(',');
            var studios = [];
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i].trim();
                if (!/^(?:\d+p?\+?|4k|rus?|ukr?|\+?ua|sdr|hdr10?\+?)$/i.test(p)) {
                    studios.push(p);
                }
            }
            var base = cleanVoice.replace(/\[.*?\]/g, '').trim();
            if (studios.length > 0) {
                cleanVoice = base ? (base + ' ' + studios[0]) : studios[0];
            } else if (base) {
                cleanVoice = base;
            }
        }

        // 3. Динамічний діапазон (Color)
        var color = 'SDR';
        var colorClass = 'tag--sdr';
        if (/dolby[\s.-]?vision|\bdv\b/i.test(str)) {
            color = 'DV';
            colorClass = 'tag--dv';
        } else if (/hdr10\+/i.test(str)) {
            color = 'HDR10+';
            colorClass = 'tag--hdr';
        } else if (/\bhdr\b/i.test(str)) {
            color = 'HDR';
            colorClass = 'tag--hdr';
        }

        // 4. Відеокодек
        var codec = (rawQuality >= 2160 || /hevc|h\.?265/i.test(str)) ? 'HEVC' : 'H.264';

        // 5. Джерело / версія
        var edition = 'WEB-DL';
        if (/\bimax\b/i.test(str)) edition = 'IMAX';
        else if (/\bremux\b/i.test(str)) edition = 'REMUX';
        else if (/\bbdrip\b|bluray/i.test(str)) edition = 'BDRip';

        // 6. Аудіо
        var audio = 'STEREO';
        if (/atmos/i.test(str)) audio = 'ATMOS';
        else if (/5\.1|\bdts\b|surround/i.test(str)) audio = '5.1 CH';
        else if (/ac-?3/i.test(str)) audio = 'AC3';

        // 7. Бейдж якості
        var qLabel = rawQuality >= 2160 ? ((color === 'HDR' || color === 'HDR10+' || color === 'DV') ? '4K HDR' : '4K UHD') :
                     (rawQuality >= 1440 ? '1440p 2K' :
                     (rawQuality >= 1080 ? '1080p FHD' :
                     (rawQuality >= 720 ? '720p HD' : '480p SD')));

        return {
            cleanVoice: cleanVoice,
            langBadge: langBadge,
            langClass: langClass,
            qLabel: qLabel,
            color: color,
            colorClass: colorClass,
            codec: codec,
            edition: edition,
            audio: audio
        };
    }

    var tmdbSeasonCache = {};

    function loadTmdbSeason(tvId, seasonNum, callback) {
        if (!tvId || !seasonNum) return callback({});
        var cacheKey = tvId + '_' + seasonNum;
        if (tmdbSeasonCache[cacheKey]) {
            return callback(tmdbSeasonCache[cacheKey]);
        }
        var storageKey = 'customs_tmdb_s_' + cacheKey;
        var stored = (Lampa.Storage && Lampa.Storage.cache) ? Lampa.Storage.cache(storageKey, 1000 * 60 * 60 * 24 * 3) : null;
        if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
            tmdbSeasonCache[cacheKey] = stored;
            return callback(stored);
        }

        var network = new Lampa.Reguest();
        network.timeout(10000);
        var lang = (Lampa.Storage && Lampa.Storage.get('language', 'uk')) || 'uk';
        var langTag = lang === 'uk' ? 'uk-UA' : (lang === 'ru' ? 'ru-RU' : 'en-US');
        var path = 'tv/' + tvId + '/season/' + seasonNum + '?language=' + langTag + '&api_key=' + Lampa.TMDB.key();
        var url = Lampa.TMDB.api(path);

        network.silent(url, function (json) {
            var map = {};
            if (json && Array.isArray(json.episodes)) {
                json.episodes.forEach(function (ep) {
                    var still = ep.still_path ? ('https://image.tmdb.org/t/p/w300' + ep.still_path) : '';
                    map[ep.episode_number] = {
                        name: ep.name || '',
                        still: still,
                        overview: ep.overview || '',
                        vote: ep.vote_average || 0
                    };
                });
            }
            tmdbSeasonCache[cacheKey] = map;
            if (Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(storageKey, map);
            callback(map);
        }, function () {
            tmdbSeasonCache[cacheKey] = {};
            callback({});
        });
    }

    function createFilmixRow(data, movie) {
        if (!data) return null;
        var isSeries = !!(data.isSeries && data.seasons && data.seasons.length);
        if (!isSeries && (!data.streams || !data.streams.length)) return null;

        var row = new Lampa.Emit();
        var html = Lampa.Template.get('items_line', { title: 'Filmix' });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 290 });
        var last = null;

        var theme = Lampa.Storage.get('customs_filmix_theme', 'hybrid');
        html.addClass('customs-filmix customs-theme-' + theme);

        if (isSeries) {
            var seasons = data.seasons;
            var currentSeasonIdx = 0;
            var currentVoiceIdx = 0;
            var currentQuality = Lampa.Storage.get('customs_filmix_last_quality', 1080);

            // Відновлення збереженого вибору для цього серіалу
            var seriesStoreKey = 'customs_filmix_series_' + movie.id;
            var savedState = Lampa.Storage.get(seriesStoreKey, null);
            if (savedState) {
                if (savedState.seasonId !== undefined) {
                    for (var si = 0; si < seasons.length; si++) {
                        if (seasons[si].id === savedState.seasonId || seasons[si].title === savedState.seasonTitle) {
                            currentSeasonIdx = si;
                            break;
                        }
                    }
                }
                var curSeason = seasons[currentSeasonIdx];
                if (curSeason && curSeason.voices && savedState.voiceName) {
                    for (var vi = 0; vi < curSeason.voices.length; vi++) {
                        if (curSeason.voices[vi].name === savedState.voiceName) {
                            currentVoiceIdx = vi;
                            break;
                        }
                    }
                }
                if (savedState.quality) {
                    currentQuality = savedState.quality;
                }
            }

            function saveFilterState() {
                var s = seasons[currentSeasonIdx];
                var v = s && s.voices && s.voices[currentVoiceIdx];
                if (!s || !v) return;
                Lampa.Storage.set(seriesStoreKey, {
                    seasonId: s.id,
                    seasonTitle: s.title,
                    voiceName: v.name,
                    quality: currentQuality
                });
                Lampa.Storage.set('customs_filmix_last_quality', currentQuality);
            }

            function updateQualityForVoice() {
                var s = seasons[currentSeasonIdx];
                var v = s && s.voices[currentVoiceIdx];
                if (!v || !v.qualities || !v.qualities.length) {
                    currentQuality = 720;
                    return;
                }
                if (v.qualities.indexOf(currentQuality) === -1) {
                    currentQuality = v.qualities[0];
                }
            }

            updateQualityForVoice();

            var filterBar = $('<div class="customs-filmix-filter-bar">' +
                '<div class="customs-filmix-filter-btn selector" data-type="season">' +
                    '<svg class="customs-filmix-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>' +
                    '<span class="customs-filmix-filter-label">Сезон:</span>' +
                    '<span class="customs-filmix-filter-val val-season"></span>' +
                    '<svg class="customs-filmix-filter-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</div>' +
                '<div class="customs-filmix-filter-btn selector" data-type="voice">' +
                    '<svg class="customs-filmix-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>' +
                    '<span class="customs-filmix-filter-label">Озвучення:</span>' +
                    '<span class="customs-filmix-filter-val val-voice"></span>' +
                    '<svg class="customs-filmix-filter-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</div>' +
                '<div class="customs-filmix-filter-btn selector" data-type="quality">' +
                    '<svg class="customs-filmix-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
                    '<span class="customs-filmix-filter-label">Якість:</span>' +
                    '<span class="customs-filmix-filter-val val-quality"></span>' +
                    '<svg class="customs-filmix-filter-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</div>' +
            '</div>');

            var btnSeason = filterBar.find('[data-type="season"]');
            var btnVoice = filterBar.find('[data-type="voice"]');
            var btnQuality = filterBar.find('[data-type="quality"]');

            function updateFilterLabels() {
                var s = seasons[currentSeasonIdx];
                var v = s && s.voices[currentVoiceIdx];

                btnSeason.find('.val-season').text(s ? s.title : '');

                var vName = v ? v.name : '';
                var vMeta = parseStreamMetadata(vName);
                var vTitle = (v && v.isUa ? '🇺🇦 ' : '') + vMeta.cleanVoice;
                btnVoice.find('.val-voice').text(vTitle);

                var qLabel = currentQuality >= 2160 ? '4K UHD' : (currentQuality >= 1440 ? '1440p 2K' : (currentQuality >= 1080 ? '1080p FHD' : (currentQuality >= 720 ? '720p HD' : '480p SD')));
                btnQuality.find('.val-quality').text(qLabel);
            }

            btnSeason.on('hover:focus', function () { last = btnSeason[0]; });
            btnVoice.on('hover:focus', function () { last = btnVoice[0]; });
            btnQuality.on('hover:focus', function () { last = btnQuality[0]; });

            btnSeason.on('hover:enter', function () {
                last = btnSeason[0];
                var menu = seasons.map(function (s, idx) {
                    return {
                        title: s.title,
                        selected: idx === currentSeasonIdx,
                        index: idx
                    };
                });
                Lampa.Select.show({
                    title: 'Виберіть сезон',
                    items: menu,
                    onBack: function () {
                        row.toggle();
                    },
                    onSelect: function (item) {
                        var prevSeason = seasons[currentSeasonIdx];
                        var prevVoiceName = (prevSeason && prevSeason.voices && prevSeason.voices[currentVoiceIdx] && prevSeason.voices[currentVoiceIdx].name) || '';
                        currentSeasonIdx = item.index;
                        var s = seasons[currentSeasonIdx];
                        var matchedVoice = 0;
                        for (var i = 0; i < s.voices.length; i++) {
                            if (s.voices[i].name === prevVoiceName) {
                                matchedVoice = i;
                                break;
                            }
                        }
                        currentVoiceIdx = matchedVoice;
                        updateQualityForVoice();
                        saveFilterState();
                        updateFilterLabels();
                        renderEpisodes();
                        row.toggle();
                    }
                });
            });

            btnVoice.on('hover:enter', function () {
                last = btnVoice[0];
                var s = seasons[currentSeasonIdx];
                var menu = s.voices.map(function (v, idx) {
                    var vMeta = parseStreamMetadata(v.name);
                    return {
                        title: (v.isUa ? '🇺🇦 ' : '') + vMeta.cleanVoice,
                        selected: idx === currentVoiceIdx,
                        index: idx
                    };
                });
                Lampa.Select.show({
                    title: 'Виберіть озвучення',
                    items: menu,
                    onBack: function () {
                        row.toggle();
                    },
                    onSelect: function (item) {
                        currentVoiceIdx = item.index;
                        updateQualityForVoice();
                        saveFilterState();
                        updateFilterLabels();
                        renderEpisodes();
                        row.toggle();
                    }
                });
            });

            btnQuality.on('hover:enter', function () {
                last = btnQuality[0];
                var s = seasons[currentSeasonIdx];
                var v = s && s.voices[currentVoiceIdx];
                var qList = (v && v.qualities) ? v.qualities : [720];
                var menu = qList.map(function (q) {
                    var qLabel = q >= 2160 ? '4K UHD' : (q >= 1440 ? '1440p 2K' : (q >= 1080 ? '1080p FHD' : (q >= 720 ? '720p HD' : '480p SD')));
                    return {
                        title: qLabel,
                        selected: q === currentQuality,
                        quality: q
                    };
                });
                Lampa.Select.show({
                    title: 'Виберіть якість',
                    items: menu,
                    onBack: function () {
                        row.toggle();
                    },
                    onSelect: function (item) {
                        currentQuality = item.quality;
                        saveFilterState();
                        updateFilterLabels();
                        renderEpisodes();
                        row.toggle();
                    }
                });
            });

            function getEpisodeHash(ep, movie) {
                if (!Lampa.Utils || !Lampa.Utils.hash) return '';
                var orig = movie.original_name || movie.original_title || movie.name || movie.title || '';
                return Lampa.Utils.hash([ep.season, ep.season > 10 ? ':' : '', ep.episode, orig].join(''));
            }

            function getEpisodeTimeline(ep, movie) {
                var hash = getEpisodeHash(ep, movie);
                var metaLink = (Lampa.Timeline && Lampa.Timeline.link) ? Lampa.Timeline.link(movie, ep.season, ep.episode) : null;
                if (hash && Lampa.Timeline && Lampa.Timeline.view) {
                    return Lampa.Timeline.view(hash, metaLink);
                }
                return { hash: hash, percent: 0, time: 0, duration: 0 };
            }

            function renderEpisodes() {
                scroll.clear();
                scroll.reset();

                var s = seasons[currentSeasonIdx];
                if (!s || !s.voices[currentVoiceIdx]) return;
                var v = s.voices[currentVoiceIdx];
                var episodes = v.episodes;

                var showSize = flag('customs_filmix_show_size', true);
                var formattedSize = showSize ? 'Онлайн' : '';
                var seriesStyle = Lampa.Storage.get('customs_filmix_series_style', 'cinema');

                var cachedTmdb = tmdbSeasonCache[movie.id + '_' + s.id] || null;

                episodes.forEach(function (ep) {
                    var playUrl = ep.link.indexOf('%s') !== -1 ? ep.link.replace(/%s/i, currentQuality) : ep.link;
                    playUrl = fixStreamUrl(playUrl);
                    var meta = parseStreamMetadata(v.name, playUrl, currentQuality);
                    var qClass = currentQuality >= 2160 ? 'q-4k' : (currentQuality >= 1440 ? 'q-1440' : (currentQuality >= 1080 ? 'q-1080' : (currentQuality >= 720 ? 'q-720' : 'q-480')));

                    var epHash = getEpisodeHash(ep, movie);
                    var timelineView = getEpisodeTimeline(ep, movie);
                    var pct = 0;
                    if (timelineView) {
                        if (typeof timelineView.percent === 'number' && timelineView.percent > 0) {
                            pct = timelineView.percent;
                        } else if (timelineView.time && timelineView.duration) {
                            pct = (timelineView.time / timelineView.duration) * 100;
                        }
                    }
                    var hideClass = (pct > 0) ? '' : ' hide';
                    var progressHtml = '<div class="customs-filmix-item__progress time-line' + hideClass + '" data-hash="' + epHash + '"><div style="width:' + Math.min(100, Math.round(pct)) + '%"></div></div>';

                    var epInfo = cachedTmdb ? cachedTmdb[ep.episode] : null;
                    var epTitle = (epInfo && epInfo.name) ? (ep.episode + '. ' + epInfo.name) : (ep.episode + ' серія');
                    var stillSrc = (epInfo && epInfo.still) ? epInfo.still : '';
                    var imgLoadedClass = stillSrc ? ' loaded' : '';

                    var cardHtml = '';

                    if (seriesStyle === 'backdrop') {
                        // Варіант 2: Glass Backdrop
                        cardHtml = '<div class="customs-filmix-item customs-filmix-item--backdrop selector" data-episode="' + ep.episode + '">' +
                            '<img class="customs-filmix-backdrop-bg' + imgLoadedClass + '" src="' + stillSrc + '" alt="" />' +
                            '<div class="customs-filmix-backdrop-glass"></div>' +
                            '<div class="customs-filmix-item__content">' +
                                '<div>' +
                                    '<div class="customs-filmix-item__header">' +
                                        '<div>' +
                                            '<div class="customs-filmix-item__ep-sub">ЕПІЗОД ' + ep.episode + '</div>' +
                                            renderTitleWrapHtml(epTitle) +
                                        '</div>' +
                                        '<span class="customs-filmix-item__quality ' + qClass + '">' + meta.qLabel + '</span>' +
                                    '</div>' +
                                    '<div class="customs-filmix-item__tags">' +
                                        '<span class="customs-filmix-tag tag--codec">' + meta.codec + '</span>' +
                                        '<span class="customs-filmix-tag ' + meta.colorClass + '">' + meta.color + '</span>' +
                                        '<span class="customs-filmix-tag tag--audio">' + meta.audio + '</span>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="customs-filmix-item__footer">' +
                                    '<div class="customs-filmix-item__size-box">' +
                                        '<svg class="customs-filmix-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:1.1em;height:1.1em;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>' +
                                        '<span class="customs-filmix-item__size">' + formattedSize + '</span>' +
                                    '</div>' +
                                    '<div class="customs-filmix-item__action">' +
                                        '<span>Дивитися</span>' +
                                        '<svg class="customs-filmix-item__play-icon" viewBox="0 0 24 24" fill="currentColor" style="width:.9em;height:.9em;flex-shrink:0;"><path d="M8 5v14l11-7z"/></svg>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                            progressHtml +
                        '</div>';
                    } else if (seriesStyle === 'horizontal') {
                        // Варіант 3: Horizontal Split
                        cardHtml = '<div class="customs-filmix-item customs-filmix-item--horizontal selector" data-episode="' + ep.episode + '">' +
                            '<div class="customs-filmix-split-left">' +
                                '<img class="customs-filmix-split__img' + imgLoadedClass + '" src="' + stillSrc + '" alt="" />' +
                                '<span class="customs-filmix-item__ep-badge">ЕП. ' + ep.episode + '</span>' +
                            '</div>' +
                            '<div class="customs-filmix-split-right">' +
                                '<div>' +
                                    '<div class="customs-filmix-item__header">' +
                                        '<span class="customs-filmix-item__ep-sub">' + ep.episode + ' СЕРІЯ</span>' +
                                        '<span class="customs-filmix-item__quality ' + qClass + '">' + meta.qLabel + '</span>' +
                                    '</div>' +
                                    renderTitleWrapHtml(epTitle) +
                                '</div>' +
                                '<div class="customs-filmix-item__tags">' +
                                    '<span class="customs-filmix-tag tag--codec">' + meta.codec + '</span>' +
                                    '<span class="customs-filmix-tag tag--audio">' + meta.audio + '</span>' +
                                '</div>' +
                                '<div class="customs-filmix-item__footer">' +
                                    '<div class="customs-filmix-item__size-box">' +
                                        '<span class="customs-filmix-item__size">' + formattedSize + '</span>' +
                                    '</div>' +
                                    '<div class="customs-filmix-item__action">' +
                                        '<span>Дивитися</span>' +
                                        '<svg class="customs-filmix-item__play-icon" viewBox="0 0 24 24" fill="currentColor" style="width:.9em;height:.9em;flex-shrink:0;"><path d="M8 5v14l11-7z"/></svg>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                            progressHtml +
                        '</div>';
                    } else {
                        // Варіант 1: Apple TV Cinema (за замовчуванням)
                        cardHtml = '<div class="customs-filmix-item customs-filmix-item--cinema selector" data-episode="' + ep.episode + '">' +
                            '<div class="customs-filmix-thumb">' +
                                '<img class="customs-filmix-thumb__img' + imgLoadedClass + '" src="' + stillSrc + '" alt="" />' +
                                '<div class="customs-filmix-thumb__overlay"></div>' +
                                '<span class="customs-filmix-item__ep-badge">ЕПІЗОД ' + ep.episode + '</span>' +
                                '<span class="customs-filmix-item__quality ' + qClass + '">' + meta.qLabel + '</span>' +
                            '</div>' +
                            '<div class="customs-filmix-item__content">' +
                                renderTitleWrapHtml(epTitle) +
                                '<div class="customs-filmix-item__tags">' +
                                    '<span class="customs-filmix-tag tag--codec">' + meta.codec + '</span>' +
                                    '<span class="customs-filmix-tag ' + meta.colorClass + '">' + meta.color + '</span>' +
                                    '<span class="customs-filmix-tag tag--edition">' + meta.edition + '</span>' +
                                    '<span class="customs-filmix-tag tag--audio">' + meta.audio + '</span>' +
                                '</div>' +
                                '<div class="customs-filmix-item__divider"></div>' +
                                '<div class="customs-filmix-item__footer">' +
                                    '<div class="customs-filmix-item__size-box">' +
                                        '<svg class="customs-filmix-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:1.1em;height:1.1em;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>' +
                                        '<span class="customs-filmix-item__size">' + formattedSize + '</span>' +
                                    '</div>' +
                                    '<div class="customs-filmix-item__action">' +
                                        '<span>Дивитися</span>' +
                                        '<svg class="customs-filmix-item__play-icon" viewBox="0 0 24 24" fill="currentColor" style="width:.9em;height:.9em;flex-shrink:0;"><path d="M8 5v14l11-7z"/></svg>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                            progressHtml +
                        '</div>';
                    }

                    var el = $(cardHtml);

                    el.find('img').on('load', function () {
                        $(this).addClass('loaded');
                    });

                    var probed = false;
                    var probeTimer = null;
                    el.on('hover:focus', function () {
                        last = el[0];
                        scroll.update(el, true);
                        checkCardMarquee(el);

                        if (!probed && playUrl && playUrl.indexOf('http') === 0 && showSize) {
                            if (probeTimer) clearTimeout(probeTimer);
                            probeTimer = setTimeout(function () {
                                if (!probed) {
                                    probed = true;
                                    probeFileSize(playUrl, function (bytes) {
                                        var mb = bytes / (1024 * 1024);
                                        var exact = formatSize(mb);
                                        if (exact) el.find('.customs-filmix-item__size').text(exact);
                                    });
                                }
                            }, 250);
                        }
                    });

                    el.on('mouseenter', function () {
                        checkCardMarquee(el);
                    });

                    el.on('hover:enter', function () {
                        last = el[0];

                        var info = (tmdbSeasonCache[movie.id + '_' + s.id] && tmdbSeasonCache[movie.id + '_' + s.id][ep.episode]) || null;
                        var curTitle = (info && info.name) ? (ep.episode + '. ' + info.name) : (ep.episode + ' серія');

                        var epQualityMap = {};
                        (v.qualities || [currentQuality]).forEach(function (q) {
                            var qUrl = ep.link.indexOf('%s') !== -1 ? ep.link.replace(/%s/i, q) : ep.link;
                            epQualityMap['\u200B' + (q >= 2160 ? '4K UHD' : q + 'p')] = fixStreamUrl(qUrl);
                        });

                        var targetPlayUrl = fixStreamUrl(playUrl);
                        if (!targetPlayUrl && epQualityMap) {
                            var qk = Object.keys(epQualityMap);
                            if (qk.length) targetPlayUrl = epQualityMap[qk[0]];
                        }

                        var epTimeline = getEpisodeTimeline(ep, movie);
                        var first = {
                            title: (movie.title || movie.name) + ' — ' + meta.cleanVoice + ' — ' + curTitle + ' [' + meta.qLabel + ']',
                            url: targetPlayUrl,
                            quality: epQualityMap,
                            timeline: epTimeline
                        };

                        var playlist = episodes.map(function (e) {
                            var eQualityMap = {};
                            (v.qualities || [currentQuality]).forEach(function (q) {
                                var qUrl = e.link.indexOf('%s') !== -1 ? e.link.replace(/%s/i, q) : e.link;
                                eQualityMap['\u200B' + (q >= 2160 ? '4K UHD' : q + 'p')] = fixStreamUrl(qUrl);
                            });
                            var eUrl = fixStreamUrl(e.link.indexOf('%s') !== -1 ? e.link.replace(/%s/i, currentQuality) : e.link);
                            if (!eUrl && eQualityMap) {
                                var eqk = Object.keys(eQualityMap);
                                if (eqk.length) eUrl = eQualityMap[eqk[0]];
                            }
                            var eInfo = (tmdbSeasonCache[movie.id + '_' + s.id] && tmdbSeasonCache[movie.id + '_' + s.id][e.episode]) || null;
                            var eTitle = (eInfo && eInfo.name) ? (e.episode + '. ' + eInfo.name) : (e.episode + ' серія');
                            var eTimeline = getEpisodeTimeline(e, movie);
                            return {
                                title: (movie.title || movie.name) + ' — ' + meta.cleanVoice + ' — ' + eTitle + ' [' + meta.qLabel + ']',
                                url: eUrl,
                                quality: eQualityMap,
                                timeline: eTimeline
                            };
                        });

                        if (playlist.length > 1) {
                            first.playlist = playlist;
                        }
                        Lampa.Player.play(first);
                        if (Lampa.Player.playlist) {
                            Lampa.Player.playlist(playlist);
                        }
                    });

                    scroll.append(el[0]);
                    checkCardMarquee(el);
                });

                if (!cachedTmdb && movie.id) {
                    loadTmdbSeason(movie.id, s.id, function (epMap) {
                        if (!epMap) return;
                        scroll.render().find('.customs-filmix-item').each(function () {
                            var card = $(this);
                            var epNum = parseInt(card.attr('data-episode'));
                            var item = epMap[epNum];
                            if (item) {
                                if (item.name) {
                                    var fullT = epNum + '. ' + item.name;
                                    card.find('.customs-filmix-item__title-text, .customs-filmix-item__title-dup').text(fullT);
                                    card.find('.customs-filmix-item__title-wrap').attr('title', fullT);
                                    checkCardMarquee(card);
                                }
                                if (item.still) {
                                    card.find('img').attr('src', item.still);
                                }
                            }
                        });
                    });
                }
            }

            html.find('.items-line__body').append(filterBar);
            html.find('.items-line__body').append(scroll.render(true));
            setTimeout(function () { checkCardMarquee(html); }, 100);

            updateFilterLabels();
            renderEpisodes();
        } else {
            // Фільми: доступні стріми
            var list = data.streams || [];
            list.forEach(function (v) {
                var meta = parseStreamMetadata(v.voice, v.url, v.raw_quality);
                var qClass = v.raw_quality >= 2160 ? 'q-4k' : (v.raw_quality >= 1440 ? 'q-1440' : (v.raw_quality >= 1080 ? 'q-1080' : (v.raw_quality >= 720 ? 'q-720' : 'q-480')));

                var el = $('<div class="customs-filmix-item selector">' +
                    '<div class="customs-filmix-item__header">' +
                        '<div class="customs-filmix-item__voice-box">' +
                            '<span class="customs-filmix-item__lang ' + meta.langClass + '">' + meta.langBadge + '</span>' +
                            renderVoiceWrapHtml(meta.cleanVoice, v.voice) +
                        '</div>' +
                        '<span class="customs-filmix-item__quality ' + qClass + '">' + meta.qLabel + '</span>' +
                    '</div>' +
                    '<div class="customs-filmix-item__tags">' +
                        '<span class="customs-filmix-tag tag--codec">' + meta.codec + '</span>' +
                        '<span class="customs-filmix-tag ' + meta.colorClass + '">' + meta.color + '</span>' +
                        '<span class="customs-filmix-tag tag--edition">' + meta.edition + '</span>' +
                        '<span class="customs-filmix-tag tag--audio">' + meta.audio + '</span>' +
                    '</div>' +
                    '<div class="customs-filmix-item__divider"></div>' +
                    '<div class="customs-filmix-item__footer">' +
                        '<div class="customs-filmix-item__size-box">' +
                            '<svg class="customs-filmix-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:1.1em;height:1.1em;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>' +
                            '<span class="customs-filmix-item__size"></span>' +
                        '</div>' +
                        '<div class="customs-filmix-item__action">' +
                            '<span>Дивитися</span>' +
                            '<svg class="customs-filmix-item__play-icon" viewBox="0 0 24 24" fill="currentColor" style="width:.9em;height:.9em;flex-shrink:0;"><path d="M8 5v14l11-7z"/></svg>' +
                        '</div>' +
                    '</div>' +
                '</div>');

                var showSize = flag('customs_filmix_show_size', true);
                el.find('.customs-filmix-item__size').text(showSize ? 'Онлайн' : '');

                var movHash = (Lampa.Utils && Lampa.Utils.hash) ? Lampa.Utils.hash(movie.original_title || movie.title || movie.name || '') : '';
                var movMeta = (Lampa.Timeline && Lampa.Timeline.link) ? Lampa.Timeline.link(movie) : null;
                var movTimeline = (movHash && Lampa.Timeline && Lampa.Timeline.view) ? Lampa.Timeline.view(movHash, movMeta) : (movie.timeline || null);
                var movPct = 0;
                if (movTimeline) {
                    if (typeof movTimeline.percent === 'number' && movTimeline.percent > 0) {
                        movPct = movTimeline.percent;
                    } else if (movTimeline.time && movTimeline.duration) {
                        movPct = (movTimeline.time / movTimeline.duration) * 100;
                    }
                }
                var movHideClass = (movPct > 0) ? '' : ' hide';
                el.append('<div class="customs-filmix-item__progress time-line' + movHideClass + '" data-hash="' + movHash + '"><div style="width:' + Math.min(100, Math.round(movPct)) + '%"></div></div>');

                var probed = false;
                var probeTimer = null;
                el.on('hover:focus', function () {
                    last = el[0];
                    scroll.update(el, true);
                    checkCardMarquee(el);

                    if (!probed && v.url && v.url.indexOf('http') === 0 && showSize) {
                        if (probeTimer) clearTimeout(probeTimer);
                        probeTimer = setTimeout(function () {
                            if (!probed) {
                                probed = true;
                                probeFileSize(v.url, function (bytes) {
                                    var mb = bytes / (1024 * 1024);
                                    var exactSize = formatSize(mb);
                                    if (exactSize) {
                                        el.find('.customs-filmix-item__size').text(exactSize);
                                    }
                                });
                            }
                        }, 250);
                    }
                });

                el.on('mouseenter', function () {
                    checkCardMarquee(el);
                });

                el.on('hover:enter', function () {
                    last = el[0];
                    Lampa.Player.play({
                        title: (movie.title || movie.name) + ' — ' + v.voice + ' [' + meta.qLabel + ']',
                        url: fixStreamUrl(v.url),
                        quality: v.qualityMap || null,
                        timeline: movTimeline || movie.timeline
                    });
                });

                scroll.append(el[0]);
                checkCardMarquee(el);
            });

            html.find('.items-line__body').append(scroll.render(true));
            setTimeout(function () { checkCardMarquee(html); }, 100);
        }

        row.create = function () {};
        row.render = function (js) { return js ? html[0] : html; };

        row.toggle = function () {
            Lampa.Controller.add(ROW_FILMIX, {
                link: row,
                toggle: function () {
                    var focusTarget = (last && $.contains(html[0], last)) ? last : false;
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(focusTarget, html);
                    row.emit('active');
                    row.emit('toggle');
                },
                update: function () {},
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else row.emit('left');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                    else row.emit('down');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else row.emit('up');
                },
                back: function () { row.emit('back'); }
            });

            Lampa.Controller.toggle(ROW_FILMIX);
        };

        row.destroy = function () {
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    // ---------- Модуль Торрентів (TorrServer Speed & Size) ----------

    var torrServerSpeedCache = {};
    var cachedTorrentsForMovie = {};

    function getTorrServerUrl() {
        var custom = Lampa.Storage.get('customs_torrserver_url', '');
        if (custom && typeof custom === 'string' && custom.trim().length > 0) {
            var u = custom.trim();
            if (u.indexOf('://') === -1) u = 'http://' + u;
            return u.replace(/\/+$/, '');
        }
        if (Lampa.Torserver && typeof Lampa.Torserver.url === 'function') {
            try {
                var lampaUrl = Lampa.Torserver.url();
                if (lampaUrl && typeof lampaUrl === 'string' && lampaUrl.trim().length > 0) {
                    var lu = lampaUrl.trim();
                    if (lu.indexOf('://') === -1) lu = 'http://' + lu;
                    return lu.replace(/\/+$/, '');
                }
            } catch (eTu) {}
        }
        var useTwo = Lampa.Storage.field ? (Lampa.Storage.field('torrserver_use_link') === 'two') : false;
        var one = Lampa.Storage.get('torrserver_url', '');
        var two = Lampa.Storage.get('torrserver_url_two', '');
        var def = (useTwo ? (two || one) : (one || two)) || 'http://127.0.0.1:8090';
        var res = (def + '').trim();
        if (res.indexOf('://') === -1) res = 'http://' + res;
        return res.replace(/\/+$/, '');
    }

    function getTorrServerHeaders() {
        var headers = {};
        try {
            var auth = Lampa.Storage.field ? Lampa.Storage.field('torrserver_auth') : Lampa.Storage.get('torrserver_auth');
            if (auth) {
                var login = Lampa.Storage.get('torrserver_login', '');
                var pass = (Lampa.Storage.value ? Lampa.Storage.value('torrserver_password') : Lampa.Storage.get('torrserver_password', '')) || '';
                if (login || pass) {
                    var str = login + ':' + pass;
                    var b64 = (Lampa.Base64 && Lampa.Base64.encode) ? Lampa.Base64.encode(str) : window.btoa(unescape(encodeURIComponent(str)));
                    headers['Authorization'] = 'Basic ' + b64;
                }
            }
        } catch (eAuth) {}
        return headers;
    }

    function sendTorrReq(net, url, success, error, post_data, params) {
        var p = params || {};
        var h = getTorrServerHeaders();
        if (!p.headers) p.headers = {};
        for (var k in h) {
            if (h.hasOwnProperty(k)) p.headers[k] = h[k];
        }
        if (net && net['native']) {
            net['native'](url, success, error, post_data, p);
        } else if (net && net.silent) {
            net.silent(url, success, error, post_data, p);
        } else if (Lampa.Reguest) {
            var r = new Lampa.Reguest();
            if (r['native']) r['native'](url, success, error, post_data, p);
            else r.silent(url, success, error, post_data, p);
        } else {
            $.ajax({
                url: url,
                type: post_data ? 'POST' : 'GET',
                data: post_data,
                headers: p.headers,
                dataType: p.dataType || 'json',
                success: success,
                error: error
            });
        }
    }

    function getParserUrl() {
        var custom = Lampa.Storage.get('customs_parser_url', '');
        if (custom && typeof custom === 'string' && custom.trim().length > 0) {
            return custom.trim().replace(/\/+$/, '');
        }
        var def = Lampa.Storage.get('jackett_url') || Lampa.Storage.get('parser_jackett_url') || Lampa.Storage.get('parser_url') || 'http://jac.red';
        return (def + '').trim().replace(/\/+$/, '');
    }

    function getParserKey() {
        var custom = Lampa.Storage.get('customs_parser_key', '');
        if (custom && typeof custom === 'string' && custom.trim().length > 0) {
            return custom.trim();
        }
        var def = Lampa.Storage.get('jackett_key') || Lampa.Storage.get('parser_jackett_key') || Lampa.Storage.get('parser_key') || '';
        return (def + '').trim();
    }

    function parseSizeToBytes(raw) {
        if (typeof raw === 'number') return raw;
        if (!raw) return 0;
        var str = (raw + '').toLowerCase().trim();
        var match = str.match(/([\d\.,]+)\s*([kmgtкмгт][bб]?)/i);
        if (!match) {
            var numOnly = parseFloat(str.replace(',', '.'));
            return isNaN(numOnly) ? 0 : numOnly;
        }
        var val = parseFloat(match[1].replace(',', '.'));
        var unit = match[2];
        if (unit.indexOf('t') !== -1 || unit.indexOf('т') !== -1) return val * 1024 * 1024 * 1024 * 1024;
        if (unit.indexOf('g') !== -1 || unit.indexOf('г') !== -1) return val * 1024 * 1024 * 1024;
        if (unit.indexOf('m') !== -1 || unit.indexOf('м') !== -1) return val * 1024 * 1024;
        if (unit.indexOf('k') !== -1 || unit.indexOf('к') !== -1) return val * 1024;
        return val;
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 МБ';
        if (bytes >= 1024 * 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2) + ' ТБ';
        }
        if (bytes >= 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' ГБ';
        }
        if (bytes >= 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
        }
        return (bytes / 1024).toFixed(0) + ' КБ';
    }

    function cleanEpisodeTitle(path, idx) {
        if (!path) return 'Серія ' + (idx || 1);
        var clean = path.replace(/^.*[\/\\]/, '');
        var match = clean.match(/s\d+e(\d+)/i) || clean.match(/[eе](\d+)/i) || clean.match(/(\d+)\s*(?:сер|ep)/i);
        if (match) {
            return 'Серія ' + parseInt(match[1], 10);
        }
        clean = clean.replace(/\.[a-zA-Z0-9]+$/, '');
        return clean.length > 32 ? (clean.slice(0, 30) + '...') : clean;
    }

    function cleanFileName(title) {
        if (!title) return 'video';
        return (title + '').replace(/[^\w\s\u0400-\u04FF\.\-]/g, '').trim().replace(/\s+/g, '.');
    }

    var MONTHS_UA = ['Січня', 'Лютого', 'Березня', 'Квітня', 'Травня', 'Червня', 'Липня', 'Серпня', 'Вересня', 'Жовтня', 'Листопада', 'Грудня'];
    function formatTorrentDate(raw) {
        if (!raw) return '';
        try {
            var d = new Date(raw);
            if (!isNaN(d.getTime())) {
                return d.getDate() + ' ' + MONTHS_UA[d.getMonth()] + ' ' + d.getFullYear();
            }
        } catch (e) {}
        return (raw + '').slice(0, 10);
    }

    function extractTorrentTags(title) {
        var str = (title || '').toLowerCase();
        var tags = {
            season: '',
            episodes: '',
            quality: '',
            voice: '',
            codecs: [],
            isUkr: false
        };

        if (/[іїєґ]|(?:\b|_)(?:ua|ukr|ukrainian)(?:\b|_)|укр|україн|\+ua/i.test(title)) {
            tags.isUkr = true;
        }

        var sMatch = title.match(/s(\d{1,2})-(\d{1,2})/i) || title.match(/сезон[и]?\s*(\d{1,2})-(\d{1,2})/i);
        if (sMatch) {
            tags.season = 'S' + parseInt(sMatch[1], 10) + '-' + parseInt(sMatch[2], 10);
        } else {
            var sSingle = title.match(/s(\d{1,2})/i) || title.match(/сезон\s*(\d{1,2})/i);
            if (sSingle) {
                tags.season = 'S' + parseInt(sSingle[1], 10);
            }
        }

        var epMatch = title.match(/(?:серии|серії|episodes|ep)\s*(\d{1,2})-(\d{1,2})/i) || title.match(/(\d{1,2})-(\d{1,2})\s*(?:сер|ep)/i);
        if (epMatch) {
            tags.episodes = epMatch[1] + '-' + epMatch[2];
        } else {
            var epOf = title.match(/(\d{1,2})\s*(?:из|з)\s*(\d{1,2})/i);
            if (epOf) {
                tags.episodes = '1-' + epOf[1];
            }
        }

        var voiceMatch = title.match(/(?:\[|\(|\s)(AlexFilm|LostFilm|HDRezka|Кубик в кубе|Цікава Ідея|DniproFilm|BaibaKo|NewStudio|Jaskier|TVShows|UaTeam|В одне рило|НеЗупиняйПродакшн|Студія Омікрон|HD-Rezka|LineStar|ColdFilm|Octopus)(?:\]|\)|\s|$)/i);
        if (voiceMatch) {
            tags.voice = voiceMatch[1];
        }

        if (str.indexOf('2160p') !== -1 || str.indexOf('4k') !== -1 || str.indexOf('uhd') !== -1) {
            tags.quality = '4K';
        } else if (str.indexOf('1080p') !== -1 || str.indexOf('1080i') !== -1 || str.indexOf('fhd') !== -1) {
            tags.quality = 'FHD';
        } else if (str.indexOf('720p') !== -1 || str.indexOf('hd') !== -1) {
            tags.quality = 'HD';
        } else {
            tags.quality = 'SD';
        }

        if (str.indexOf('hdr10+') !== -1) tags.codecs.push('HDR10+');
        else if (str.indexOf('hdr') !== -1) tags.codecs.push('HDR');

        if (str.indexOf('dovi') !== -1 || str.indexOf('dolby vision') !== -1) tags.codecs.push('DV');
        if (str.indexOf('hevc') !== -1 || str.indexOf('h.265') !== -1 || str.indexOf('x265') !== -1) tags.codecs.push('HEVC');
        if (str.indexOf('remux') !== -1) tags.codecs.push('Remux');
        else if (str.indexOf('bdrip') !== -1 || str.indexOf('bluray') !== -1) tags.codecs.push('BDRip');
        else if (str.indexOf('web-dl') !== -1 || str.indexOf('webdl') !== -1) tags.codecs.push('WEB-DL');

        return tags;
    }

    function calculateRequiredSpeed(item, movie, isSeries) {
        var durationMinutes = 110;
        if (isSeries) {
            durationMinutes = (movie.episode_run_time && movie.episode_run_time[0]) || 45;
        } else if (movie.runtime && movie.runtime > 20) {
            durationMinutes = movie.runtime;
        }

        var episodes = 1;
        if (isSeries) {
            var epMatch = item.title.match(/(\d{1,3})\s*(?:сер|ep)/i);
            if (epMatch) {
                episodes = parseInt(epMatch[1], 10) || 8;
            } else if (item.tags && item.tags.season && item.tags.season.indexOf('-') !== -1) {
                episodes = 24;
            } else {
                episodes = 8;
            }
        }

        var singleEpisodeBytes = item.sizeBytes / Math.max(1, episodes);
        var durationSec = Math.max(600, durationMinutes * 60);
        var requiredBytesPerSec = (singleEpisodeBytes / durationSec) * 1.3;
        return Math.max(400 * 1024, requiredBytesPerSec);
    }

    function normalizeTorrentItems(items, movie, isSeries) {
        if (!items || !items.length) return [];
        var result = [];

        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it) continue;

            var rawTitle = it.Title || it.title || '';
            if (!rawTitle) continue;

            var magnet = it.MagnetUri || it.magnet || it.Link || it.link || '';
            if (!magnet) continue;

            var sizeRaw = it.Size || it.size || 0;
            var sizeBytes = parseSizeToBytes(sizeRaw);
            if (sizeBytes <= 0) continue;

            var seeds = parseInt(it.Seeders || it.seeders || 0, 10);
            if (isNaN(seeds)) seeds = 0;

            var leech = parseInt(it.Peers || it.peers || it.leechers || 0, 10);
            if (isNaN(leech)) leech = 0;

            var tracker = it.Tracker || it.tracker || '';
            if (!tracker && typeof magnet === 'string') {
                if (magnet.indexOf('toloka') !== -1) tracker = 'toloka';
                else if (magnet.indexOf('rutor') !== -1) tracker = 'rutor';
                else if (magnet.indexOf('rutracker') !== -1) tracker = 'rutracker';
            }
            if (!tracker) tracker = 'torrent';

            var tags = extractTorrentTags(rawTitle);
            var rawDate = it.PublishDate || it.PubDate || it.pubdate || it.date || '';
            var dateStr = formatTorrentDate(rawDate);

            result.push({
                title: rawTitle,
                magnet: magnet,
                sizeBytes: sizeBytes,
                sizeStr: formatBytes(sizeBytes),
                seeds: seeds,
                leech: leech,
                tracker: tracker,
                date: dateStr,
                tags: tags
            });
        }

        // Сортування суворо від більшої ваги до меншої
        result.sort(function (a, b) {
            return b.sizeBytes - a.sizeBytes;
        });

        return result.slice(0, 50);
    }

    function fallbackDirectParserSearch(query, movie, isSeries, callback) {
        var parserUrl = getParserUrl();
        var parserKey = getParserKey();
        var network = new Lampa.Reguest();
        var searchUrl;

        if (parserUrl.indexOf(':8090') !== -1 || parserUrl.indexOf('torrserver') !== -1) {
            searchUrl = parserUrl + '/search?query=' + encodeURIComponent(query);
        } else {
            searchUrl = parserUrl + '/api/v2.0/indexers/all/results?Query=' + encodeURIComponent(query);
            if (parserKey) searchUrl += '&apikey=' + encodeURIComponent(parserKey);
        }

        network.timeout(10000);
        network.silent(searchUrl, function (res) {
            var items = [];
            if (res && res.Results && res.Results.length) {
                items = res.Results;
            } else if (res && res.results && res.results.length) {
                items = res.results;
            } else if (Array.isArray(res)) {
                items = res;
            }

            var parsed = normalizeTorrentItems(items, movie, isSeries);
            if (parsed.length > 0) {
                callback(parsed);
            } else {
                var origQuery = (movie.original_title || movie.original_name || '').trim();
                if (origQuery && origQuery !== query) {
                    var fbUrl = parserUrl + '/api/v2.0/indexers/all/results?Query=' + encodeURIComponent(origQuery);
                    if (parserKey) fbUrl += '&apikey=' + encodeURIComponent(parserKey);
                    network.silent(fbUrl, function (res2) {
                        var items2 = (res2 && (res2.Results || res2.results)) || (Array.isArray(res2) ? res2 : []);
                        callback(normalizeTorrentItems(items2, movie, isSeries));
                    }, function () {
                        callback([]);
                    });
                } else {
                    callback([]);
                }
            }
        }, function () {
            callback([]);
        });
    }

    function searchTorrents(movie, isSeries, callback) {
        var customParserUrl = Lampa.Storage.get('customs_parser_url', '');
        var query = (movie.title || movie.name || '').trim();
        if (!query) query = (movie.original_title || movie.original_name || '').trim();
        if (!query) return callback([]);

        // 1. Пріоритет: Нативний парсер Lampa (якщо користувач не задав свій окремий URL)
        if (!customParserUrl && Lampa.Parser && Lampa.Parser.get) {
            try {
                Lampa.Parser.get({
                    search: query,
                    movie: movie
                }, function (res) {
                    var items = (res && (res.Results || res.results)) || (Array.isArray(res) ? res : []);
                    var parsed = normalizeTorrentItems(items, movie, isSeries);
                    if (parsed.length > 0) {
                        callback(parsed);
                    } else {
                        // Спробуємо оригінальну назву
                        var origQuery = (movie.original_title || movie.original_name || '').trim();
                        if (origQuery && origQuery !== query) {
                            Lampa.Parser.get({
                                search: origQuery,
                                movie: movie
                            }, function (res2) {
                                var items2 = (res2 && (res2.Results || res2.results)) || (Array.isArray(res2) ? res2 : []);
                                callback(normalizeTorrentItems(items2, movie, isSeries));
                            }, function () {
                                fallbackDirectParserSearch(query, movie, isSeries, callback);
                            });
                        } else {
                            fallbackDirectParserSearch(query, movie, isSeries, callback);
                        }
                    }
                }, function () {
                    fallbackDirectParserSearch(query, movie, isSeries, callback);
                });
                return;
            } catch (e) {}
        }

        fallbackDirectParserSearch(query, movie, isSeries, callback);
    }

    function probeTorrServerSpeed(item, movie, isSeries, callback) {
        if (!item || !item.magnet) {
            if (callback) callback({ speed: 0, seeders: 0, reqSpeed: 1, ratio: 0, status: 'red', text: 'Немає посилання' });
            return { abort: function () {} };
        }

        var torrUrl = getTorrServerUrl();
        var reqSpeed = calculateRequiredSpeed(item, movie, isSeries);
        var isAborted = false;
        var pollTimer = null;
        var pollTimer2 = null;
        var dropHash = null;

        var netPreload = new Lampa.Reguest();
        var netAdd = new Lampa.Reguest();
        var netStat = new Lampa.Reguest();
        var netDrop = new Lampa.Reguest();
        var netEcho = new Lampa.Reguest();

        // 1. Надсилаємо preload через sendTorrReq (сумісно з Android TV native HTTP та Tizen/webOS)
        netPreload.timeout(5000);
        var preloadUrl = torrUrl + '/stream/fname.mkv?link=' + encodeURIComponent(item.magnet) + '&preload';
        sendTorrReq(netPreload, preloadUrl, function () {}, function () {}, false, { dataType: 'text' });

        // 2. Також додаємо роздачу через POST /torrents action: add (для TorrServer MatriX)
        netAdd.timeout(3000);
        sendTorrReq(netAdd, torrUrl + '/torrents', function (res) {
            if (res && res.hash) dropHash = res.hash;
        }, function () {}, JSON.stringify({
            action: 'add',
            link: item.magnet,
            title: 'probe_' + (item.title || 'customs').slice(0, 30),
            save_to_db: false
        }));

        function cleanupAndReturn(result) {
            if (isAborted) return;
            isAborted = true;

            if (pollTimer) clearTimeout(pollTimer);
            if (pollTimer2) clearTimeout(pollTimer2);

            netPreload.clear();
            netAdd.clear();
            netStat.clear();
            netEcho.clear();

            if (callback) callback(result);
        }

        function evaluateAndReturn(stat) {
            if (stat && stat.hash) dropHash = stat.hash;
            var speed = (stat && (stat.download_speed || stat.DownloadSpeed)) || 0;
            var seeders = (stat && (stat.connected_seeders || stat.active_peers || stat.ConnectedSeeders || stat.ActivePeers)) || item.seeds || 0;
            var bytesRead = (stat && (stat.bytes_read || stat.preloaded_bytes || stat.BytesRead || stat.PreloadedBytes)) || 0;

            if (speed === 0 && bytesRead > 0) {
                speed = Math.round(bytesRead / 2.5);
            }

            var ratio = reqSpeed > 0 ? (speed / reqSpeed) : 1;
            var status = 'red';

            if (ratio >= 1.2 && speed > 500 * 1024) {
                status = 'green';
            } else if (ratio >= 0.75 && speed > 200 * 1024) {
                status = 'yellow';
            }

            cleanupAndReturn({
                speed: speed,
                seeders: seeders,
                reqSpeed: reqSpeed,
                ratio: ratio,
                status: status
            });
        }

        function queryStat(onSuccess, onError) {
            netStat.timeout(4000);
            var statUrl = torrUrl + '/stream/fname.mkv?link=' + encodeURIComponent(item.magnet) + '&stat';
            sendTorrReq(netStat, statUrl, function (res) {
                var torrent = (res && res.Torrent) ? res.Torrent : res;
                if (torrent && (typeof torrent.download_speed !== 'undefined' || typeof torrent.connected_seeders !== 'undefined')) {
                    onSuccess(torrent);
                } else if (dropHash) {
                    sendTorrReq(netStat, torrUrl + '/torrents', function (res2) {
                        onSuccess((res2 && res2.Torrent) ? res2.Torrent : res2);
                    }, onError, JSON.stringify({ action: 'get', hash: dropHash }));
                } else {
                    onError(new Error('No response'));
                }
            }, function (err) {
                if (dropHash) {
                    sendTorrReq(netStat, torrUrl + '/torrents', function (res2) {
                        onSuccess((res2 && res2.Torrent) ? res2.Torrent : res2);
                    }, onError, JSON.stringify({ action: 'get', hash: dropHash }));
                } else {
                    onError(err);
                }
            });
        }

        // Опитуємо через 2.2 с
        pollTimer = setTimeout(function () {
            if (isAborted) return;
            queryStat(function (res1) {
                var sp1 = (res1 && (res1.download_speed || res1.DownloadSpeed)) || 0;
                if (sp1 > 0) {
                    evaluateAndReturn(res1);
                } else {
                    // Якщо піри ще розганяються, зачекаємо ще 1.5 с
                    pollTimer2 = setTimeout(function () {
                        if (isAborted) return;
                        queryStat(function (res2) {
                            evaluateAndReturn(res2);
                        }, function () {
                            evaluateAndReturn(res1 || {});
                        });
                    }, 1500);
                }
            }, function () {
                // Перевіримо чи TorrServer взагалі онлайн
                netEcho.timeout(3000);
                sendTorrReq(netEcho, torrUrl + '/', function () {
                    evaluateAndReturn({ download_speed: 0, connected_seeders: item.seeds || 0 });
                }, function (a) {
                    if (a && a.status === 401) {
                        evaluateAndReturn({ download_speed: 0, connected_seeders: item.seeds || 0 });
                    } else {
                        sendTorrReq(netEcho, torrUrl + '/settings', function () {
                            evaluateAndReturn({ download_speed: 0, connected_seeders: item.seeds || 0 });
                        }, function () {
                            cleanupAndReturn({
                                speed: 0,
                                seeders: 0,
                                reqSpeed: reqSpeed,
                                ratio: 0,
                                status: 'offline',
                                text: '⚠️ TorrServer не відповідає'
                            });
                        }, JSON.stringify({ action: 'get' }), { dataType: 'text' });
                    }
                }, false, { dataType: 'text' });
            });
        }, 2200);

        return {
            abort: function () {
                isAborted = true;
                if (pollTimer) clearTimeout(pollTimer);
                if (pollTimer2) clearTimeout(pollTimer2);
                netPreload.clear();
                netAdd.clear();
                netStat.clear();
                netEcho.clear();
                if (dropHash) {
                    netDrop.timeout(2000);
                    sendTorrReq(netDrop, torrUrl + '/torrents', function () {}, function () {}, JSON.stringify({ action: 'drop', hash: dropHash }), { dataType: 'text' });
                }
            }
        };
    }

    function updateCardSpeedBadge(cardEl, res) {
        if (!cardEl || !cardEl.length || !res) return;
        var speedBadge = cardEl.find('.customs-torrent-speed');
        speedBadge.removeClass('customs-speed--idle customs-speed--testing customs-speed--green customs-speed--yellow customs-speed--red customs-speed--offline');

        var speedText = '';
        var mbps = (res.speed / (1024 * 1024)).toFixed(1);

        if (res.status === 'green') {
            speedBadge.addClass('customs-speed--green');
            var pct = Math.round(res.ratio * 100);
            speedText = mbps + ' MB/s ✓ Запас ' + pct + '%';
        } else if (res.status === 'yellow') {
            speedBadge.addClass('customs-speed--yellow');
            speedText = mbps + ' MB/s ⚠️ Впритул';
        } else if (res.status === 'offline') {
            speedBadge.addClass('customs-speed--offline');
            speedText = '⚠️ TorrServer офлайн';
        } else {
            speedBadge.addClass('customs-speed--red');
            if (res.speed > 0) {
                speedText = mbps + ' MB/s ✕ Замало';
            } else if (res.seeders > 0) {
                speedText = '0 MB/s (P: ' + res.seeders + ') ✕ Повільно';
            } else {
                speedText = '0 MB/s ✕ Немає роздачі';
            }
        }

        speedBadge.find('.customs-speed-text').text(speedText);
    }

    function handleTorrentPlayback(item, movie, isSeries) {
        if (!item || !item.magnet) {
            Lampa.Noty.show('Не вдалося отримати посилання на торент');
            return;
        }

        var posterUrl = (movie && movie.img) || (movie && movie.poster_path ? ('https://image.tmdb.org/t/p/w500' + movie.poster_path) : '');

        var torrentElement = {
            title: item.title,
            MagnetUri: item.magnet,
            Link: item.magnet,
            size: item.sizeBytes || 0,
            tracker: item.tracker || 'customs',
            poster: posterUrl
        };

        // Пріоритет: Нативний Torrent.start Lampa (нативно відкриває вікно "Файли", групує сезони по папках, завантажує прев'ю серій та трекає перегляд)
        if (Lampa.Torrent && Lampa.Torrent.start) {
            try {
                Lampa.Torrent.start(torrentElement, movie);
                return;
            } catch (eTs) {
                console.error('Lampa.Torrent.start error', eTs);
            }
        }

        var torrUrl = getTorrServerUrl();
        var playUrl = torrUrl + '/stream/' + encodeURIComponent(cleanFileName(item.title) + '.mkv') + '?link=' + encodeURIComponent(item.magnet) + '&play';
        Lampa.Player.play({
            title: item.title,
            url: playUrl
        });
        Lampa.Player.playlist([{
            title: item.title,
            url: playUrl
        }]);
    }

    function playSeriesTorrentFile(item, file, allFiles, torrUrl) {
        var fileId = (file && typeof file.id !== 'undefined') ? file.id : 0;
        var fileName = (file && file.path) ? file.path.replace(/^.*[\/\\]/, '') : (cleanFileName(item.title) + '.mkv');

        var playUrl = torrUrl + '/stream/' + encodeURIComponent(fileName) + '?link=' + encodeURIComponent(item.magnet) + '&index=' + fileId + '&play';

        var playlist = [];
        if (allFiles && allFiles.length) {
            for (var i = 0; i < allFiles.length; i++) {
                var f = allFiles[i];
                var fName = (f.path || '').replace(/^.*[\/\\]/, '');
                var fUrl = torrUrl + '/stream/' + encodeURIComponent(fName) + '?link=' + encodeURIComponent(item.magnet) + '&index=' + f.id + '&play';
                playlist.push({
                    title: cleanEpisodeTitle(f.path, i + 1),
                    url: fUrl
                });
            }
        } else {
            playlist.push({
                title: item.title,
                url: playUrl
            });
        }

        Lampa.Player.play({
            title: cleanEpisodeTitle(file ? file.path : '', 1) + ' — ' + item.title,
            url: playUrl
        });
        Lampa.Player.playlist(playlist);
    }

    function buildCinemaGlassCard(item, idx, movie, isSeries) {
        var card = $('<div class="customs-ts-card selector" data-index="' + idx + '">' +
            '<div class="customs-ts-card__title">' + escapeHtml(item.title) + '</div>' +
            '<div class="customs-ts-card__badges"></div>' +
            '<div class="customs-ts-card__footer">' +
                '<div class="customs-ts-card__meta-left">' +
                    (item.tracker ? '<span class="customs-ts-tag customs-ts-tag--tracker">' + escapeHtml(item.tracker) + '</span>' : '') +
                    (item.date ? '<span class="customs-ts-date">' + escapeHtml(item.date) + '</span>' : '') +
                '</div>' +
                '<div class="customs-ts-card__meta-right">' +
                    '<div class="customs-ts-stat">' +
                        '<span class="customs-ts-stat__label">Роздають:</span>' +
                        '<span class="customs-ts-stat__val customs-ts-stat__val--seeds">' + item.seeds + '</span>' +
                    '</div>' +
                    '<div class="customs-ts-stat">' +
                        '<span class="customs-ts-stat__label">Качають:</span>' +
                        '<span class="customs-ts-stat__val">' + item.leech + '</span>' +
                    '</div>' +
                    '<div class="customs-speed-badge customs-speed--idle">' +
                        '<span class="customs-speed-dot"></span>' +
                        '<span class="customs-speed-text">⚡️ В черзі...</span>' +
                    '</div>' +
                    '<span class="customs-ts-size">' + item.sizeStr + '</span>' +
                '</div>' +
            '</div>' +
        '</div>');

        card.data('item', item);
        card.data('magnet', item.magnet);

        var badgesBox = card.find('.customs-ts-card__badges');
        if (item.tags.season) {
            badgesBox.append('<span class="customs-ts-tag customs-ts-tag--season">' + escapeHtml(item.tags.season) + '</span>');
        }
        if (item.tags.episodes) {
            badgesBox.append('<span class="customs-ts-tag customs-ts-tag--episodes">' + escapeHtml(item.tags.episodes) + '</span>');
        }
        if (item.tags.quality) {
            var qClass = item.tags.quality === '4K' ? 'customs-ts-tag--q-4k' : 'customs-ts-tag--q-fhd';
            badgesBox.append('<span class="customs-ts-tag customs-ts-tag--quality ' + qClass + '">' + escapeHtml(item.tags.quality) + '</span>');
        }
        if (item.tags.voice) {
            badgesBox.append('<span class="customs-ts-tag customs-ts-tag--voice">🎤 ' + escapeHtml(item.tags.voice) + '</span>');
        }
        if (item.tags.codecs && item.tags.codecs.length) {
            for (var c = 0; c < item.tags.codecs.length; c++) {
                badgesBox.append('<span class="customs-ts-tag customs-ts-tag--codec">' + escapeHtml(item.tags.codecs[c]) + '</span>');
            }
        }
        if (item.tags.isUkr) {
            badgesBox.append('<span class="customs-ts-tag customs-ts-tag--ukr">🇺🇦 UKR</span>');
        }

        if (torrServerSpeedCache[item.magnet]) {
            updateGlassCardSpeedBadge(card, torrServerSpeedCache[item.magnet]);
        }

        return card;
    }

    function updateGlassCardSpeedBadge(cardEl, res) {
        if (!cardEl || !cardEl.length || !res) return;
        var badge = cardEl.find('.customs-speed-badge');
        badge.removeClass('customs-speed--idle customs-speed--testing customs-speed--green customs-speed--yellow customs-speed--red customs-speed--offline');

        var speedText = '';
        var mbps = (res.speed / (1024 * 1024)).toFixed(1);

        if (res.status === 'green') {
            badge.addClass('customs-speed--green');
            var pct = Math.round(res.ratio * 100);
            speedText = mbps + ' MB/s <span class="customs-subbadge">✓ Запас ' + pct + '%</span>';
        } else if (res.status === 'yellow') {
            badge.addClass('customs-speed--yellow');
            speedText = mbps + ' MB/s <span class="customs-subbadge">⚠️ Впритул</span>';
        } else if (res.status === 'offline') {
            badge.addClass('customs-speed--offline');
            speedText = '⚠️ TorrServer офлайн';
        } else {
            badge.addClass('customs-speed--red');
            if (res.speed > 0) {
                speedText = mbps + ' MB/s <span class="customs-subbadge">✕ Замало</span>';
            } else if (res.seeders > 0) {
                speedText = '0 MB/s (P: ' + res.seeders + ') <span class="customs-subbadge">✕ Повільно</span>';
            } else {
                speedText = '0 MB/s <span class="customs-subbadge">✕ Немає роздачі</span>';
            }
        }

        badge.find('.customs-speed-text').html(speedText);
    }

    function setGlassCardTesting(cardEl) {
        if (!cardEl || !cardEl.length) return;
        var badge = cardEl.find('.customs-speed-badge');
        badge.removeClass('customs-speed--idle customs-speed--green customs-speed--yellow customs-speed--red customs-speed--offline').addClass('customs-speed--testing');
        badge.find('.customs-speed-text').html('Тест бітрейту...');
    }

    function openCustomsTorrentsScreen(movie, isSeries, initialList) {
        if (!movie) return;
        Lampa.Activity.push({
            url: '',
            title: '⚡️ Торренти — ' + (movie.title || movie.name || ''),
            component: 'customs_torrents_screen',
            movie: movie,
            isSeries: Boolean(isSeries),
            initialList: initialList || cachedTorrentsForMovie[movie.id] || null,
            page: 1
        });
    }

    function openAllTorrentsModal(movie, isSeries, allItems) {
        openCustomsTorrentsScreen(movie, isSeries, allItems);
    }

    function CustomsTorrentsComponent(object) {
        var _this = this;
        var movie = object.movie || {};
        var isSeries = Boolean(object.isSeries);
        var scroll = new Lampa.Scroll({ over: true, mask: true, step: 250 });

        var poster = (movie && movie.poster_path) ? ('https://image.tmdb.org/t/p/w500' + movie.poster_path) : (movie && movie.img ? movie.img : '');
        var year = (movie && (movie.release_date || movie.first_air_date)) ? (movie.release_date || movie.first_air_date).slice(0, 4) : '';
        var country = '';
        if (movie && movie.production_countries && movie.production_countries.length) {
            country = movie.production_countries[0].name || movie.production_countries[0].iso_3166_1 || '';
        } else if (movie && movie.origin_country && movie.origin_country.length) {
            country = movie.origin_country[0];
        }
        var vote = (movie && typeof movie.vote_average !== 'undefined' && movie.vote_average > 0) ? Number(movie.vote_average).toFixed(1) : '';
        var age = (movie && (movie.age_limit || movie.pg)) ? (movie.age_limit || movie.pg) : (movie && movie.adult ? '18+' : '12+');
        var movieTitle = (movie && (movie.title || movie.name)) || '';
        var genresStr = '';
        if (movie && movie.genres && movie.genres.length) {
            var gNames = [];
            for (var gi = 0; gi < movie.genres.length && gi < 3; gi++) {
                gNames.push(movie.genres[gi].name || movie.genres[gi]);
            }
            genresStr = gNames.join(', ');
        }
        var descrStr = (movie && (movie.overview || movie.descr || movie.description)) || '';

        var html = $('<div class="customs-torrents-screen">' +
            '<div class="customs-ts-sidebar">' +
                (poster ? '<div class="customs-ts-poster-wrap"><img class="customs-ts-poster" src="' + escapeHtml(poster) + '" /></div>' : '') +
                '<div class="customs-ts-meta-line">' +
                    (year ? '<span class="customs-ts-year">' + escapeHtml(year) + '</span>' : '') +
                    (year && country ? '<span class="customs-ts-meta-sep">•</span>' : '') +
                    (country ? '<span class="customs-ts-country">' + escapeHtml(country) + '</span>' : '') +
                '</div>' +
                '<div class="customs-ts-rate-line">' +
                    (vote ? '<span class="customs-ts-rate">★ ' + escapeHtml(vote) + '</span>' : '') +
                    (age ? '<span class="customs-ts-age">' + escapeHtml(age) + '</span>' : '') +
                '</div>' +
                '<div class="customs-ts-title">' + escapeHtml(movieTitle) + '</div>' +
                (genresStr ? '<div class="customs-ts-genres">' + escapeHtml(genresStr) + '</div>' : '') +
                (descrStr ? '<div class="customs-ts-descr">' + escapeHtml(descrStr) + '</div>' : '') +
            '</div>' +
            '<div class="customs-ts-main">' +
                '<div class="customs-ts-head">' +
                    '<div class="customs-ts-head__controls">' +
                        '<div class="customs-ts-ctrl selector customs-ts-sort" data-action="sort">' +
                            '<span class="customs-ts-ctrl__label">Сортування:</span> ' +
                            '<span class="customs-ts-sort-val">По розміру <span class="customs-sort-arrow">⬇️</span></span>' +
                        '</div>' +
                        '<div class="customs-ts-ctrl selector customs-ts-filter active" data-filter="all">Всі</div>' +
                        '<div class="customs-ts-ctrl selector customs-ts-filter" data-filter="4k">4K</div>' +
                        '<div class="customs-ts-ctrl selector customs-ts-filter" data-filter="1080p">1080p</div>' +
                        '<div class="customs-ts-ctrl selector customs-ts-filter" data-filter="ukr">🇺🇦 Тільки UKR</div>' +
                    '</div>' +
                    '<div class="customs-ts-autotest-status">' +
                        '<span class="customs-ts-autotest-icon">⚡️</span>' +
                        '<span class="customs-ts-autotest-val">Очікування...</span>' +
                    '</div>' +
                '</div>' +
                '<div class="customs-ts-body"></div>' +
            '</div>' +
        '</div>');

        var body = html.find('.customs-ts-body');
        var sortDesc = true;
        var currentFilter = 'all';
        var allItems = object.initialList || cachedTorrentsForMovie[movie.id] || [];
        var lastFocused = null;
        var lastFocusedCard = null;
        var focusTimer = null;
        var autoTestTimer = null;
        var isAutoTesting = false;
        var isDestroyed = false;
        var autoTestQueue = [];
        var autoTestIdx = 0;
        var inHeader = false;
        var activeProbe = null;

        function findCardByMagnet(magnet) {
            if (!magnet) return $();
            return scroll.render().find('.customs-ts-card').filter(function () {
                return $(this).data('magnet') === magnet;
            });
        }

        function updateAutoTestStatus(testedCount, totalCount, currentName) {
            var statusVal = html.find('.customs-ts-autotest-val');
            if (!statusVal.length) return;
            if (totalCount === 0) {
                statusVal.text('Немає 4K/FHD');
            } else if (testedCount >= totalCount) {
                statusVal.html('<span style="color:#4ade80;">✓ 4K/FHD перевірено (' + totalCount + ')</span>');
            } else if (currentName) {
                statusVal.html('<span class="customs-autotest-pulse">Тест ' + (testedCount + 1) + '/' + totalCount + ': ' + escapeHtml(currentName) + '</span>');
            } else {
                statusVal.text(testedCount + ' / ' + totalCount + ' перевірено');
            }
        }

        function startAutoTestQueue(itemsToTest) {
            if (autoTestTimer) clearTimeout(autoTestTimer);
            if (activeProbe && activeProbe.abort) activeProbe.abort();

            autoTestQueue = [];
            for (var i = 0; i < itemsToTest.length; i++) {
                var it = itemsToTest[i];
                var q = (it.tags && it.tags.quality) || '';
                var t = it.title || '';
                if (q === '4K' || q === 'FHD' || /4k|2160|1080|fhd/i.test(t)) {
                    autoTestQueue.push(it);
                }
            }

            autoTestIdx = 0;
            isAutoTesting = true;

            var testedCount = 0;
            for (var k = 0; k < autoTestQueue.length; k++) {
                if (torrServerSpeedCache[autoTestQueue[k].magnet]) {
                    testedCount++;
                }
            }
            updateAutoTestStatus(testedCount, autoTestQueue.length);

            stepAutoTest();
        }

        function stepAutoTest() {
            if (isDestroyed || !isAutoTesting) return;
            if (autoTestIdx >= autoTestQueue.length) {
                isAutoTesting = false;
                updateAutoTestStatus(autoTestQueue.length, autoTestQueue.length);
                return;
            }

            var currentItem = autoTestQueue[autoTestIdx];

            if (torrServerSpeedCache[currentItem.magnet]) {
                var card = findCardByMagnet(currentItem.magnet);
                if (card.length) {
                    updateGlassCardSpeedBadge(card, torrServerSpeedCache[currentItem.magnet]);
                }
                autoTestIdx++;
                stepAutoTest();
                return;
            }

            var cardEl = findCardByMagnet(currentItem.magnet);
            if (cardEl.length) {
                setGlassCardTesting(cardEl);
            }

            var shortTitle = (currentItem.tags && currentItem.tags.quality ? currentItem.tags.quality : '') + ' ' + (currentItem.sizeStr || '');
            updateAutoTestStatus(autoTestIdx, autoTestQueue.length, shortTitle);

            activeProbe = probeTorrServerSpeed(currentItem, movie, isSeries, function (res) {
                if (isDestroyed) return;
                if (res && res.speed > 0) {
                    torrServerSpeedCache[currentItem.magnet] = res;
                }
                var targetCard = findCardByMagnet(currentItem.magnet);
                if (targetCard.length) {
                    updateGlassCardSpeedBadge(targetCard, res);
                }

                autoTestIdx++;
                updateAutoTestStatus(autoTestIdx, autoTestQueue.length);

                autoTestTimer = setTimeout(function () {
                    stepAutoTest();
                }, 250);
            });
        }

        function renderSkeletons() {
            if (_this.activity && _this.activity.loader) {
                try { _this.activity.loader(false); } catch (eL) {}
            }
            if (scroll.clear) scroll.clear();
            if (scroll.body) {
                try { $(scroll.body()).empty(); } catch (eB) {}
            }
            for (var s = 0; s < 5; s++) {
                var skel = $('<div class="customs-ts-card customs-ts-card--skel">' +
                    '<div class="customs-ts-skel-line customs-ts-skel-title"></div>' +
                    '<div class="customs-ts-skel-line customs-ts-skel-badges"></div>' +
                    '<div class="customs-ts-skel-line customs-ts-skel-foot"></div>' +
                '</div>');
                scroll.append(skel[0] || skel);
            }
        }

        function setupHeaderControls() {
            var headControls = html.find('.customs-ts-head__controls');

            headControls.find('.customs-ts-sort').on('hover:enter', function () {
                sortDesc = !sortDesc;
                $(this).find('.customs-sort-arrow').text(sortDesc ? '⬇️' : '⬆️');
                renderCards();
            }).on('hover:focus', function () {
                inHeader = true;
                lastFocused = this;
            });

            headControls.find('.customs-ts-filter').on('hover:enter', function () {
                headControls.find('.customs-ts-filter').removeClass('active');
                $(this).addClass('active');
                currentFilter = $(this).attr('data-filter') || 'all';
                renderCards();
            }).on('hover:focus', function () {
                inHeader = true;
                lastFocused = this;
            });
        }

        function renderCards() {
            if (_this.activity && _this.activity.loader) {
                try { _this.activity.loader(false); } catch (eL) {}
            }
            if (scroll.clear) scroll.clear();
            if (scroll.body) {
                try { $(scroll.body()).empty(); } catch (eB) {}
            }

            var list = allItems.slice();

            if (currentFilter === '4k') {
                list = list.filter(function (it) {
                    var q = (it.tags.quality || '') + ' ' + (it.title || '');
                    return /4k|2160/i.test(q);
                });
            } else if (currentFilter === '1080p') {
                list = list.filter(function (it) {
                    var q = (it.tags.quality || '') + ' ' + (it.title || '');
                    return /1080|fhd/i.test(q);
                });
            } else if (currentFilter === 'ukr') {
                list = list.filter(function (it) {
                    return it.tags.isUkr;
                });
            }

            list.sort(function (a, b) {
                var szA = a.sizeBytes || 0;
                var szB = b.sizeBytes || 0;
                return sortDesc ? (szB - szA) : (szA - szB);
            });

            html.find('.customs-ts-filter[data-filter="all"]').text('Всі (' + allItems.length + ')');

            if (!list.length) {
                var empty = $('<div class="customs-ts-empty">' +
                    '<div class="customs-ts-empty__icon">🔍</div>' +
                    '<div class="customs-ts-empty__title">Роздач не знайдено</div>' +
                    '<div class="customs-ts-empty__desc">Спробуйте змінити фільтр або перевірте налаштування парсера</div>' +
                '</div>');
                scroll.append(empty[0] || empty);
                return;
            }

            for (var i = 0; i < list.length; i++) {
                (function (item, idx) {
                    var card = buildCinemaGlassCard(item, idx, movie, isSeries);

                    card.on('hover:focus', function () {
                        inHeader = false;
                        lastFocused = this;
                        lastFocusedCard = this;
                        scroll.update($(this), true);

                        if (focusTimer) clearTimeout(focusTimer);
                        focusTimer = setTimeout(function () {
                            if (torrServerSpeedCache[item.magnet]) {
                                updateGlassCardSpeedBadge(card, torrServerSpeedCache[item.magnet]);
                            } else {
                                setGlassCardTesting(card);
                                if (activeProbe && activeProbe.abort) activeProbe.abort();
                                activeProbe = probeTorrServerSpeed(item, movie, isSeries, function (res) {
                                    if (isDestroyed) return;
                                    if (res && res.speed > 0) {
                                        torrServerSpeedCache[item.magnet] = res;
                                    }
                                    updateGlassCardSpeedBadge(card, res);
                                    if (isAutoTesting) {
                                        autoTestTimer = setTimeout(function () {
                                            stepAutoTest();
                                        }, 300);
                                    }
                                });
                            }
                        }, 400);
                    });

                    card.on('hover:enter', function () {
                        handleTorrentPlayback(item, movie, isSeries);
                    });

                    scroll.append(card[0] || card);
                })(list[i], i);
            }

            startAutoTestQueue(list);

            if (Lampa.Layer && Lampa.Layer.visible) {
                try {
                    Lampa.Layer.visible(html[0]);
                } catch (eLayer) {}
            }

            if (!inHeader) {
                var first = scroll.render().find('.customs-ts-card.selector').eq(0)[0];
                if (first) {
                    lastFocusedCard = first;
                    lastFocused = first;
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(first, scroll.render());
                }
            }
        }

        this.create = function () {
            if (_this.activity && _this.activity.loader) {
                try { _this.activity.loader(false); } catch (eL) {}
            }
            body.append(scroll.render());
            setupHeaderControls();

            if (allItems && allItems.length) {
                renderCards();
            } else {
                renderSkeletons();
                searchTorrents(movie, isSeries, function (list) {
                    allItems = list || [];
                    cachedTorrentsForMovie[movie.id] = allItems;
                    renderCards();
                });
            }

            return html;
        };

        this.render = function (js) {
            return js ? html[0] : html;
        };

        this.start = function () {
            if (_this.activity && _this.activity.loader) {
                try { _this.activity.loader(false); } catch (eL) {}
            }
            if (Lampa.Layer && Lampa.Layer.visible) {
                try { Lampa.Layer.visible(html[0]); } catch (eLv) {}
            }
            Lampa.Controller.add('customs_torrents_screen', {
                toggle: function () {
                    if (inHeader) {
                        Lampa.Controller.collectionSet(html.find('.customs-ts-head__controls'));
                        Lampa.Controller.collectionFocus(lastFocused || html.find('.customs-ts-ctrl').eq(0)[0], html.find('.customs-ts-head__controls'));
                    } else {
                        Lampa.Controller.collectionSet(scroll.render());
                        var target = lastFocusedCard || scroll.render().find('.customs-ts-card.selector').eq(0)[0];
                        Lampa.Controller.collectionFocus(target, scroll.render());
                    }
                },
                up: function () {
                    if (inHeader) {
                        // Already in header
                    } else {
                        if (Navigator.canmove('up')) {
                            Navigator.move('up');
                        } else {
                            inHeader = true;
                            Lampa.Controller.collectionSet(html.find('.customs-ts-head__controls'));
                            var targetHead = html.find('.customs-ts-head__controls .selector.active')[0] || html.find('.customs-ts-ctrl')[0];
                            Lampa.Controller.collectionFocus(targetHead, html.find('.customs-ts-head__controls'));
                        }
                    }
                },
                down: function () {
                    if (inHeader) {
                        inHeader = false;
                        Lampa.Controller.collectionSet(scroll.render());
                        var target = lastFocusedCard && $.contains(scroll.render()[0], lastFocusedCard) ? lastFocusedCard : scroll.render().find('.customs-ts-card.selector').eq(0)[0];
                        if (target) Lampa.Controller.collectionFocus(target, scroll.render());
                    } else {
                        if (Navigator.canmove('down')) Navigator.move('down');
                    }
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('customs_torrents_screen');
        };

        this.pause = function () {};
        this.stop = function () {};

        this.destroy = function () {
            isDestroyed = true;
            isAutoTesting = false;
            if (focusTimer) clearTimeout(focusTimer);
            if (autoTestTimer) clearTimeout(autoTestTimer);
            if (activeProbe && activeProbe.abort) activeProbe.abort();
            scroll.destroy();
            html.remove();
        };
    }

    function createTorrentsRow(items, movie, isSeries) {
        var row = new Lampa.Emit();
        var html = Lampa.Template.get('items_line', { title: '⚡️ Торренти (TorrServer)' });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 320 });
        var last = null;
        var focusTimer = null;

        html.addClass('customs-torrents');

        var displayItems = items.slice(0, 12);

        for (var i = 0; i < displayItems.length; i++) {
            (function (item) {
                var card = $('<div class="customs-torrent-card selector">' +
                    '<div class="customs-torrent-card__title">' + escapeHtml(item.title) + '</div>' +
                    '<div class="customs-torrent-card__badges"></div>' +
                    '<div class="customs-torrent-card__foot">' +
                        '<div class="customs-torrent-card__meta">' +
                            '<span class="customs-torrent-tracker">' + escapeHtml(item.tracker) + '</span>' +
                            '<span class="customs-torrent-seeds">S: ' + item.seeds + ' / L: ' + item.leech + '</span>' +
                        '</div>' +
                        '<div class="customs-torrent-card__status">' +
                            '<div class="customs-torrent-speed customs-speed--idle">' +
                                '<span class="customs-speed-dot"></span>' +
                                '<span class="customs-speed-text">⚡️ Перевірити</span>' +
                            '</div>' +
                            '<span class="customs-torrent-size">' + item.sizeStr + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>');

                var badgesBox = card.find('.customs-torrent-card__badges');
                if (item.tags.season) {
                    badgesBox.append('<span class="customs-torrent-tag customs-torrent-tag--season">' + item.tags.season + '</span>');
                }
                if (item.tags.quality) {
                    badgesBox.append('<span class="customs-torrent-tag customs-torrent-tag--quality">' + item.tags.quality + '</span>');
                }
                if (item.tags.codecs && item.tags.codecs.length) {
                    for (var c = 0; c < item.tags.codecs.length; c++) {
                        badgesBox.append('<span class="customs-torrent-tag customs-torrent-tag--codec">' + item.tags.codecs[c] + '</span>');
                    }
                }
                if (item.tags.isUkr) {
                    badgesBox.append('<span class="customs-torrent-tag customs-torrent-tag--ukr">🇺🇦 UKR</span>');
                }

                if (torrServerSpeedCache[item.magnet]) {
                    updateCardSpeedBadge(card, torrServerSpeedCache[item.magnet]);
                }

                card.on('hover:focus', function () {
                    last = this;
                    scroll.update($(this), true);

                    if (focusTimer) clearTimeout(focusTimer);
                    focusTimer = setTimeout(function () {
                        if (torrServerSpeedCache[item.magnet]) {
                            updateCardSpeedBadge(card, torrServerSpeedCache[item.magnet]);
                        } else {
                            var speedBadge = card.find('.customs-torrent-speed');
                            speedBadge.removeClass('customs-speed--idle customs-speed--green customs-speed--yellow customs-speed--red').addClass('customs-speed--testing');
                            speedBadge.find('.customs-speed-text').text('Тест бітрейту...');

                            probeTorrServerSpeed(item, movie, isSeries, function (res) {
                                if (res && res.speed > 0) {
                                    torrServerSpeedCache[item.magnet] = res;
                                }
                                updateCardSpeedBadge(card, res);
                            });
                        }
                    }, 700);
                });

                card.on('hover:enter', function () {
                    handleTorrentPlayback(item, movie, isSeries);
                });

                scroll.append(card[0]);
            })(displayItems[i]);
        }

        if (items.length > 12) {
            var moreCard = $('<div class="customs-torrent-card customs-torrent-card--more selector">' +
                '<div class="customs-torrent-more-body">' +
                    '<div class="customs-torrent-more-icon">📑</div>' +
                    '<div class="customs-torrent-more-title">Всі роздачі</div>' +
                    '<div class="customs-torrent-more-sub">Показати всі ' + items.length + ' роздач</div>' +
                '</div>' +
            '</div>');

            moreCard.on('hover:focus', function () {
                last = this;
                scroll.update($(this), true);
            });

            moreCard.on('hover:enter', function () {
                openAllTorrentsModal(movie, isSeries, items);
            });

            scroll.append(moreCard[0]);
        }

        html.find('.items-line__body').append(scroll.render(true));

        row.create = function () {};
        row.render = function (js) { return js ? html[0] : html; };
        row.toggle = function () {
            Lampa.Controller.add(ROW_TORRENTS, {
                link: row,
                toggle: function () {
                    var focusTarget = (last && $.contains(html[0], last)) ? last : false;
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(focusTarget, html);
                    row.emit('active');
                    row.emit('toggle');
                },
                update: function () {},
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else row.emit('left'); },
                down: function () { if (Navigator.canmove('down')) Navigator.move('down'); else row.emit('down'); },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else row.emit('up'); },
                back: function () { row.emit('back'); }
            });
            Lampa.Controller.toggle(ROW_TORRENTS);
        };

        row.destroy = function () {
            if (focusTimer) clearTimeout(focusTimer);
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    function createTorrentsSkeletonRow() {
        var row = new Lampa.Emit();
        var html = Lampa.Template.get('items_line', { title: '⚡️ Торренти (TorrServer)' });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 320 });
        var last = null;

        html.addClass('customs-torrents');

        for (var i = 0; i < 4; i++) {
            var skelHtml = '<div class="customs-torrent-skeleton selector">' +
                '<div class="customs-torrent-skeleton__title"></div>' +
                '<div class="customs-torrent-skeleton__badges"></div>' +
                '<div class="customs-torrent-skeleton__foot">' +
                    '<div class="customs-torrent-skeleton__meta"></div>' +
                    '<div class="customs-torrent-skeleton__size"></div>' +
                '</div>' +
            '</div>';
            var el = $(skelHtml);
            el.on('hover:focus', function () {
                last = this;
                scroll.update($(this), true);
            });
            scroll.append(el[0]);
        }

        html.find('.items-line__body').append(scroll.render(true));

        row.create = function () {};
        row.render = function (js) { return js ? html[0] : html; };
        row.toggle = function () {
            Lampa.Controller.add(ROW_TORRENTS, {
                link: row,
                toggle: function () {
                    var focusTarget = (last && $.contains(html[0], last)) ? last : false;
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(focusTarget, html);
                    row.emit('active');
                    row.emit('toggle');
                },
                update: function () {},
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else row.emit('left'); },
                down: function () { if (Navigator.canmove('down')) Navigator.move('down'); else row.emit('down'); },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else row.emit('up'); },
                back: function () { row.emit('back'); }
            });
            Lampa.Controller.toggle(ROW_TORRENTS);
        };

        row.destroy = function () {
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    function insertTorrentsRow(link, row) {
        var first = link.items && link.items[0];
        if (!first || !link.rows) return;
        if (link.rows.indexOf(ROW_TORRENTS) !== -1) return;

        var startDom = first.render(true);
        var filmixIdx = link.rows.indexOf(ROW_FILMIX);
        var insertIndex = 1;
        var anchorDom = startDom;

        if (filmixIdx !== -1 && link.items[filmixIdx]) {
            insertIndex = filmixIdx + 1;
            anchorDom = link.items[filmixIdx].render(true);
        }

        row.use({
            onDown: link.emit.bind(link, 'down'),
            onUp: link.emit.bind(link, 'up'),
            onBack: link.emit.bind(link, 'back'),
            onLeft: link.emit.bind(link, 'left'),
            onActive: function () { link.active = link.items.indexOf(row); },
            onToggle: function () {
                var dom = row.render(true);
                if (dom && link.scroll && link.scroll.update) link.scroll.update(dom);
            }
        });

        if (anchorDom && anchorDom.parentNode) {
            anchorDom.parentNode.insertBefore(row.render(true), anchorDom.nextSibling);
        }

        link.items.splice(insertIndex, 0, row);
        link.rows.splice(insertIndex, 0, ROW_TORRENTS);
        if (link.active >= insertIndex) link.active++;

        if (Lampa.Layer && Lampa.Layer.visible && link.scroll && link.scroll.render) {
            try {
                var tDom = link.scroll.render(true);
                if (tDom) Lampa.Layer.visible(tDom);
            } catch (e) {}
        }
    }

    // ---------- Скелетони та вставка рядків на сторінку ----------

    function createFilmixSkeletonRow(isSeries) {
        var row = new Lampa.Emit();
        var html = Lampa.Template.get('items_line', { title: 'Filmix' });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 290 });
        var last = null;

        var theme = Lampa.Storage.get('customs_filmix_theme', 'hybrid');
        html.addClass('customs-filmix customs-theme-' + theme);

        if (isSeries) {
            var filterBar = $('<div class="customs-filmix-filter-bar">' +
                '<div class="customs-filmix-filter-btn customs-filmix-filter-btn--skeleton selector">' +
                    '<span class="customs-filmix-skeleton__pill" style="width:5.5em;"></span>' +
                '</div>' +
                '<div class="customs-filmix-filter-btn customs-filmix-filter-btn--skeleton selector">' +
                    '<span class="customs-filmix-skeleton__pill" style="width:8.5em;"></span>' +
                '</div>' +
                '<div class="customs-filmix-filter-btn customs-filmix-filter-btn--skeleton selector">' +
                    '<span class="customs-filmix-skeleton__pill" style="width:6em;"></span>' +
                '</div>' +
            '</div>');
            filterBar.find('.selector').on('hover:focus', function () {
                last = this;
            });
            html.find('.items-line__body').append(filterBar);
        }

        for (var i = 0; i < 5; i++) {
            var skelHtml = isSeries ?
                '<div class="customs-filmix-skeleton selector">' +
                    '<div class="customs-filmix-skeleton__thumb"></div>' +
                    '<div class="customs-filmix-skeleton__body">' +
                        '<div class="customs-filmix-skeleton__line customs-filmix-skeleton__line--title"></div>' +
                        '<div class="customs-filmix-skeleton__line customs-filmix-skeleton__line--tags"></div>' +
                        '<div class="customs-filmix-skeleton__line customs-filmix-skeleton__line--foot"></div>' +
                    '</div>' +
                '</div>' :
                '<div class="customs-filmix-skeleton customs-filmix-skeleton--movie selector">' +
                    '<div class="customs-filmix-skeleton__body">' +
                        '<div class="customs-filmix-skeleton__line customs-filmix-skeleton__line--title"></div>' +
                        '<div class="customs-filmix-skeleton__line customs-filmix-skeleton__line--tags"></div>' +
                        '<div class="customs-filmix-skeleton__line customs-filmix-skeleton__line--foot"></div>' +
                    '</div>' +
                '</div>';
            var el = $(skelHtml);
            el.on('hover:focus', function () {
                last = this;
                scroll.update($(this), true);
            });
            scroll.append(el[0]);
        }

        html.find('.items-line__body').append(scroll.render(true));

        row.create = function () {};
        row.render = function (js) { return js ? html[0] : html; };

        row.toggle = function () {
            Lampa.Controller.add(ROW_FILMIX, {
                link: row,
                toggle: function () {
                    var focusTarget = (last && $.contains(html[0], last)) ? last : false;
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(focusTarget, html);
                    row.emit('active');
                    row.emit('toggle');
                },
                update: function () {},
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else row.emit('left'); },
                down: function () { if (Navigator.canmove('down')) Navigator.move('down'); else row.emit('down'); },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else row.emit('up'); },
                back: function () { row.emit('back'); }
            });
            Lampa.Controller.toggle(ROW_FILMIX);
        };

        row.destroy = function () {
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    function createTrailersSkeletonRow() {
        var row = new Lampa.Emit();
        var html = Lampa.Template.get('items_line', { title: 'Трейлери' });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 300 });
        var last = null;

        html.addClass('ua-trailers');

        for (var i = 0; i < 4; i++) {
            var el = $('<div class="ua-trailer customs-trailer-skeleton selector">' +
                '<div class="customs-trailer-skeleton__thumb"></div>' +
                '<div class="customs-trailer-skeleton__line"></div>' +
                '<div class="customs-trailer-skeleton__sub"></div>' +
            '</div>');
            el.on('hover:focus', function () {
                last = this;
                scroll.update($(this), true);
            });
            scroll.append(el[0]);
        }

        html.find('.items-line__body').append(scroll.render(true));

        row.create = function () {};
        row.render = function (js) { return js ? html[0] : html; };

        row.toggle = function () {
            Lampa.Controller.add(ROW_TRAILERS, {
                link: row,
                toggle: function () {
                    var focusTarget = (last && $.contains(html[0], last)) ? last : false;
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(focusTarget, html);
                    row.emit('active');
                    row.emit('toggle');
                },
                update: function () {},
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else row.emit('left'); },
                down: function () { if (Navigator.canmove('down')) Navigator.move('down'); else row.emit('down'); },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else row.emit('up'); },
                back: function () { row.emit('back'); }
            });
            Lampa.Controller.toggle(ROW_TRAILERS);
        };

        row.destroy = function () {
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    function swapRow(link, oldRow, newRow, rowId) {
        if (!link || !link.rows || !oldRow || !newRow) return;
        var oldDom = oldRow.render(true);
        var newDom = newRow.render(true);
        if (oldDom && oldDom.parentNode && newDom) {
            oldDom.parentNode.replaceChild(newDom, oldDom);
        }
        var idx = link.rows.indexOf(rowId);
        if (idx !== -1) {
            link.items[idx] = newRow;
        }
        newRow.use({
            onDown: link.emit.bind(link, 'down'),
            onUp: link.emit.bind(link, 'up'),
            onBack: link.emit.bind(link, 'back'),
            onLeft: link.emit.bind(link, 'left'),
            onActive: function () { link.active = link.items.indexOf(newRow); },
            onToggle: function () {
                var dom = newRow.render(true);
                if (dom && link.scroll && link.scroll.update) link.scroll.update(dom);
            }
        });
        var isCurrentActive = (link.active === idx);
        oldRow.destroy();
        if (isCurrentActive) {
            newRow.toggle();
        }
        if (Lampa.Layer && Lampa.Layer.visible && link.scroll && link.scroll.render) {
            try {
                var scrollDom = link.scroll.render(true);
                if (scrollDom) Lampa.Layer.visible(scrollDom);
            } catch (e) {}
        }
    }

    function removeRow(link, row, rowId) {
        if (!link || !link.rows) return;
        var idx = link.rows.indexOf(rowId);
        var wasActive = (link.active === idx);
        if (idx !== -1) {
            link.rows.splice(idx, 1);
            link.items.splice(idx, 1);
            if (link.active >= idx && link.active > 0) link.active--;
        }
        if (row && row.destroy) {
            try { row.destroy(); } catch (e) {}
        } else if (row && row.render) {
            try {
                var dom = row.render(true);
                if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
            } catch (e) {}
        }
        if (wasActive && link.items && link.items[link.active] && link.items[link.active].toggle) {
            try {
                link.items[link.active].toggle();
            } catch (e) {}
        }
        var currentItem = link.items && link.items[link.active];
        if (currentItem && currentItem.render && link.scroll && link.scroll.update) {
            try {
                var currentDom = currentItem.render(true);
                if (currentDom) link.scroll.update(currentDom);
            } catch (e) {}
        }
        if (Lampa.Layer && Lampa.Layer.visible && link.scroll && link.scroll.render) {
            try {
                var layerDom = link.scroll.render(true);
                if (layerDom) Lampa.Layer.visible(layerDom);
            } catch (e) {}
        }
    }

    // 1. Filmix: ЗАВЖДИ ПЕРШИМ під обкладинкою та кнопками (позиція №1)
    function insertFilmixRow(link, row) {
        var first = link.items && link.items[0];
        if (!first || !link.rows) return;
        if (link.rows.indexOf(ROW_FILMIX) !== -1) return;

        var startDom = first.render(true);
        var insertIndex = 1;

        row.use({
            onDown: link.emit.bind(link, 'down'),
            onUp: link.emit.bind(link, 'up'),
            onBack: link.emit.bind(link, 'back'),
            onLeft: link.emit.bind(link, 'left'),
            onActive: function () { link.active = link.items.indexOf(row); },
            onToggle: function () {
                var dom = row.render(true);
                if (dom && link.scroll && link.scroll.update) link.scroll.update(dom);
            }
        });

        if (startDom && startDom.parentNode) {
            startDom.parentNode.insertBefore(row.render(true), startDom.nextSibling);
        }

        link.items.splice(insertIndex, 0, row);
        link.rows.splice(insertIndex, 0, ROW_FILMIX);
        if (link.active >= insertIndex) link.active++;

        if (Lampa.Layer && Lampa.Layer.visible && link.scroll && link.scroll.render) {
            try {
                var sDom = link.scroll.render(true);
                if (sDom) Lampa.Layer.visible(sDom);
            } catch (e) {}
        }
    }

    // 3. Трейлери: ЗАВЖДИ СЛІДОМ ЗА ТОРРЕНТАМИ ТА FILMIX
    function insertTrailersRow(link, row) {
        var first = link.items && link.items[0];
        if (!first || !link.rows) return;
        if (link.rows.indexOf(ROW_TRAILERS) !== -1) return;

        var startDom = first.render(true);
        var filmixIdx = link.rows.indexOf(ROW_FILMIX);
        var torrIdx = link.rows.indexOf(ROW_TORRENTS);
        var insertIndex = 1;
        var anchorDom = startDom;

        if (torrIdx !== -1 && link.items[torrIdx]) {
            insertIndex = torrIdx + 1;
            anchorDom = link.items[torrIdx].render(true);
        } else if (filmixIdx !== -1 && link.items[filmixIdx]) {
            insertIndex = filmixIdx + 1;
            anchorDom = link.items[filmixIdx].render(true);
        }

        row.use({
            onDown: link.emit.bind(link, 'down'),
            onUp: link.emit.bind(link, 'up'),
            onBack: link.emit.bind(link, 'back'),
            onLeft: link.emit.bind(link, 'left'),
            onActive: function () { link.active = link.items.indexOf(row); },
            onToggle: function () {
                var dom = row.render(true);
                if (dom && link.scroll && link.scroll.update) link.scroll.update(dom);
            }
        });

        if (anchorDom && anchorDom.parentNode) {
            anchorDom.parentNode.insertBefore(row.render(true), anchorDom.nextSibling);
        }

        link.items.splice(insertIndex, 0, row);
        link.rows.splice(insertIndex, 0, ROW_TRAILERS);
        if (link.active >= insertIndex) link.active++;

        if (Lampa.Layer && Lampa.Layer.visible && link.scroll && link.scroll.render) {
            try {
                var tDom = link.scroll.render(true);
                if (tDom) Lampa.Layer.visible(tDom);
            } catch (e) {}
        }
    }

    function onFull(e) {
        if (e.type !== 'complite') return;

        var movie = e.data && e.data.movie;
        if (!movie || !movie.id) return;

        var method = (e.object && e.object.method) || (movie.name ? 'tv' : 'movie');
        if (method !== 'movie' && method !== 'tv') {
            method = movie.name ? 'tv' : 'movie';
        }

        var isSeries = Boolean(
            method === 'tv' ||
            (movie.name && !movie.title) ||
            movie.number_of_seasons ||
            movie.seasons ||
            movie.first_air_date ||
            (movie.media_type === 'tv') ||
            (e.object && e.object.card && e.object.card.name && !e.object.card.title)
        );
        if (isSeries) method = 'tv';

        var page = e.body && e.body[0];
        var network = new Lampa.Reguest();

        // 0. Кнопка у меню «Джерело» / панель дій картки (СИНХРОННО)
        if (flag('customs_torrents_enabled', true)) {
            try {
                var cardRender = (e.object && e.object.activity && e.object.activity.render) ? e.object.activity.render() : $(page);
                if (cardRender && cardRender.length && !cardRender.find('.view--customs-torrents').length) {
                    var tBtn = $('<div class="full-start__button selector view--customs-torrents" data-subtitle="v' + PLUGIN_VERSION + ' • TorrServer Speed &amp; Size">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                            '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>' +
                        '</svg>' +
                        '<span>⚡️ Торренти (Customs)</span>' +
                    '</div>');

                    tBtn.on('hover:enter', function () {
                        openCustomsTorrentsScreen(movie, isSeries);
                    });

                    var nativeTorrent = cardRender.find('.view--torrent');
                    if (nativeTorrent.length) {
                        nativeTorrent.after(tBtn);
                    } else {
                        var btnBox = cardRender.find('.full-start-new__buttons, .full-start__buttons');
                        if (btnBox.length) btnBox.append(tBtn);
                    }
                }
            } catch (eBtn) {}
        }

        // 1. Filmix: Вставляємо скелетон ВІДРАЗУ (або готові картки, якщо є в кеші)
        var filmixSkeleton = null;
        if (flag('customs_filmix_enabled', true)) {
            var cachedFilmix = getFilmixCache(movie.id);
            if (cachedFilmix) {
                var readyRow = createFilmixRow(cachedFilmix, movie);
                if (readyRow) insertFilmixRow(e.link, readyRow);
            } else {
                filmixSkeleton = createFilmixSkeletonRow(isSeries);
                insertFilmixRow(e.link, filmixSkeleton);

                searchFilmix(movie, function (res) {
                    if (!page || !document.body.contains(page)) return;
                    if (res && ((res.streams && res.streams.length) || (res.seasons && res.seasons.length))) {
                        var realRow = createFilmixRow(res, movie);
                        if (realRow) {
                            swapRow(e.link, filmixSkeleton, realRow, ROW_FILMIX);
                        } else {
                            removeRow(e.link, filmixSkeleton, ROW_FILMIX);
                        }
                    } else {
                        removeRow(e.link, filmixSkeleton, ROW_FILMIX);
                    }
                });
            }
        }

        // 2. Торренти (TorrServer): Вставляємо скелетон ВІДРАЗУ слідом за Filmix
        var torrentsSkeleton = null;
        if (flag('customs_torrents_enabled', true)) {
            torrentsSkeleton = createTorrentsSkeletonRow();
            insertTorrentsRow(e.link, torrentsSkeleton);

            searchTorrents(movie, isSeries, function (list) {
                if (!page || !document.body.contains(page)) return;
                cachedTorrentsForMovie[movie.id] = list || [];
                if (list && list.length) {
                    var realTorrentsRow = createTorrentsRow(list, movie, isSeries);
                    swapRow(e.link, torrentsSkeleton, realTorrentsRow, ROW_TORRENTS);
                } else {
                    removeRow(e.link, torrentsSkeleton, ROW_TORRENTS);
                }
            });
        }

        // 3. Трейлери: Вставляємо скелетон ВІДРАЗУ слідом за Торрентами
        var trailersSkeleton = null;
        if (flag('customs_trailers_enabled', true)) {
            var langs = enabledLangs();
            if (langs.length) {
                trailersSkeleton = createTrailersSkeletonRow();
                insertTrailersRow(e.link, trailersSkeleton);

                loadTrailers(network, method, movie.id, langs, function (list) {
                    if (!page || !document.body.contains(page)) return;
                    if (list && list.length) {
                        var realTrailersRow = createTrailersRow(list, langs);
                        swapRow(e.link, trailersSkeleton, realTrailersRow, ROW_TRAILERS);
                    } else {
                        removeRow(e.link, trailersSkeleton, ROW_TRAILERS);
                    }
                });
            }
        }
    }

    // ---------- Стилі ----------

    function addStyle() {
        var css = [
            /* Трейлери */
            '.ua-trailers .scroll__body{display:flex;}',
            '.ua-trailers .scroll__content{padding-top:.5em;padding-bottom:.5em;}',
            '.ua-trailer{flex-shrink:0;width:18em;margin-right:1.5em;}',
            '.ua-trailer__img{position:relative;padding-bottom:56.25%;border-radius:1em;overflow:hidden;background:rgba(255,255,255,.08);}',
            '.ua-trailer__img img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;}',
            '.ua-trailer.focus .ua-trailer__img{box-shadow:0 0 0 .3em #fff;}',
            '.ua-trailer__lang{position:absolute;top:.6em;left:.6em;padding:.15em .5em;border-radius:.4em;' +
                'background:rgba(0,0,0,.65);font-size:.8em;font-weight:600;letter-spacing:.05em;}',
            '.ua-trailer__lang:empty{display:none;}',
            '.ua-trailer__title{margin-top:.7em;font-size:1.1em;line-height:1.3;max-height:2.6em;overflow:hidden;}',
            '.ua-trailer__sub{margin-top:.3em;font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.ua-trailer__source{font-weight:600;opacity:.85;}',
            '.ua-trailer__source--youtube{color:#ff5a5a;}',
            '.ua-trailer__source--tmdb{color:#5fd0f5;}',
            '.ua-trailer__meta{opacity:.6;}',

            /* Анімація дихання (Skeleton Breathing Pulse) */
            '@keyframes customs-pulse{0%,100%{opacity:.35;}50%{opacity:.85;}}',

            /* Трейлери: Скелетони */
            '.customs-trailer-skeleton{opacity:.85;transition:transform .2s ease;}',
            '.customs-trailer-skeleton__thumb{position:relative;padding-bottom:56.25%;border-radius:1em;background:rgba(255,255,255,0.08);animation:customs-pulse 2.2s ease-in-out infinite;}',
            '.customs-trailer-skeleton.focus .customs-trailer-skeleton__thumb{box-shadow:0 0 0 .3em rgba(255,255,255,.8);}',
            '.customs-trailer-skeleton__line{margin-top:.7em;height:1.1em;width:75%;border-radius:.4em;background:rgba(255,255,255,0.08);animation:customs-pulse 2.2s ease-in-out infinite;}',
            '.customs-trailer-skeleton__sub{margin-top:.4em;height:.85em;width:40%;border-radius:.35em;background:rgba(255,255,255,0.05);animation:customs-pulse 2.2s ease-in-out infinite;}',

            /* Filmix стрічка: Загальні стилі */
            '.customs-filmix .scroll__body{display:flex;}',
            '.customs-filmix .scroll__content{padding-top:.6em;padding-bottom:.8em;}',
            '.customs-filmix-filter-bar{display:flex;align-items:center;gap:.75em;padding:.4em 1.5em 1.1em 1.5em;flex-wrap:wrap;}',
            '.customs-filmix-filter-btn{display:inline-flex;align-items:center;gap:.65em;padding:.62em 1.2em;border-radius:.85em;cursor:pointer;font-size:1.05em;transition:transform .2s cubic-bezier(0.16,1,0.3,1),background .2s cubic-bezier(0.16,1,0.3,1),box-shadow .2s cubic-bezier(0.16,1,0.3,1),border-color .2s cubic-bezier(0.16,1,0.3,1),color .2s cubic-bezier(0.16,1,0.3,1);box-sizing:border-box;}',
            '.customs-filmix-filter-icon{width:1.35em;height:1.35em;stroke:currentColor;flex-shrink:0;opacity:.85;transition:stroke .2s ease,opacity .2s ease;}',
            '.customs-filmix-filter-label{font-weight:500;transition:color .2s ease;}',
            '.customs-filmix-filter-val{font-weight:700;transition:color .2s ease;}',
            '.customs-filmix-filter-arrow{width:.95em;height:.95em;stroke:currentColor;opacity:.6;margin-left:.1em;flex-shrink:0;transition:stroke .2s ease,opacity .2s ease;}',
            '.customs-filmix-filter-btn--skeleton{min-width:6.5em;height:2.65em;padding:.62em 1.1em;}',
            '.customs-filmix-skeleton__pill{display:inline-block;height:1em;border-radius:.35em;background:rgba(255,255,255,0.14);animation:customs-pulse 2.2s ease-in-out infinite;}',

            /* 🌟 Тема 1: Скло Apple TV (Frosted Glass) */
            '.customs-theme-glass .customs-filmix-filter-btn{background:rgba(255,255,255,0.08);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.9);box-shadow:inset 0 1px 1px rgba(255,255,255,0.15),0 4px 12px rgba(0,0,0,0.25);}',
            '.customs-theme-glass .customs-filmix-filter-label{color:rgba(255,255,255,0.6);}',
            '.customs-theme-glass .customs-filmix-filter-val{color:#fff;}',
            '.customs-theme-glass .customs-filmix-filter-btn.focus{background:rgba(255,255,255,0.26);border-color:rgba(255,255,255,0.9);transform:scale(1.05);color:#fff;box-shadow:0 0 25px rgba(255,255,255,0.35),inset 0 1px 2px rgba(255,255,255,0.5);z-index:2;}',
            '.customs-theme-glass .customs-filmix-item{background:rgba(20,25,35,0.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.16);box-shadow:0 8px 24px rgba(0,0,0,0.35),inset 0 1px 1px rgba(255,255,255,0.12);}',
            '.customs-theme-glass .customs-filmix-item.focus{background:rgba(30,40,60,0.85);border-color:rgba(255,255,255,0.95);transform:scale(1.05);box-shadow:0 14px 35px rgba(0,0,0,0.6),0 0 25px rgba(255,255,255,0.25);z-index:5;}',
            '.customs-theme-glass .customs-filmix-skeleton{background:rgba(20,25,35,0.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.12);}',

            /* ⚪ Тема 2: Нативний Lampa (Clean White / Pure Lampa) */
            '.customs-theme-lampa .customs-filmix-filter-btn{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:rgba(255,255,255,0.9);box-shadow:none;}',
            '.customs-theme-lampa .customs-filmix-filter-label{color:rgba(255,255,255,0.6);}',
            '.customs-theme-lampa .customs-filmix-filter-val{color:#fff;}',
            '.customs-theme-lampa .customs-filmix-filter-btn.focus{background:#fff !important;color:#000 !important;border-color:#fff !important;transform:scale(1.04);box-shadow:0 0 22px rgba(255,255,255,0.5);z-index:2;}',
            '.customs-theme-lampa .customs-filmix-filter-btn.focus .customs-filmix-filter-icon{stroke:#000 !important;opacity:1 !important;}',
            '.customs-theme-lampa .customs-filmix-filter-btn.focus .customs-filmix-filter-label{color:rgba(0,0,0,0.7) !important;}',
            '.customs-theme-lampa .customs-filmix-filter-btn.focus .customs-filmix-filter-val{color:#000 !important;}',
            '.customs-theme-lampa .customs-filmix-filter-btn.focus .customs-filmix-filter-arrow{stroke:#000 !important;opacity:.8 !important;}',
            '.customs-theme-lampa .customs-filmix-item{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);box-shadow:0 6px 18px rgba(0,0,0,0.3);}',
            '.customs-theme-lampa .customs-filmix-item.focus{background:rgba(255,255,255,0.18);border-color:#fff;transform:scale(1.04);box-shadow:0 0 0 3px #fff,0 12px 30px rgba(0,0,0,0.6);z-index:5;}',
            '.customs-theme-lampa .customs-filmix-skeleton{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);}',

            /* 🔀 Тема 3: Гібридна (Білі кнопки + Скляні картки, за замовчуванням) */
            '.customs-theme-hybrid .customs-filmix-filter-btn{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:rgba(255,255,255,0.9);box-shadow:none;}',
            '.customs-theme-hybrid .customs-filmix-filter-label{color:rgba(255,255,255,0.6);}',
            '.customs-theme-hybrid .customs-filmix-filter-val{color:#fff;}',
            '.customs-theme-hybrid .customs-filmix-filter-btn.focus{background:#fff !important;color:#000 !important;border-color:#fff !important;transform:scale(1.04);box-shadow:0 0 22px rgba(255,255,255,0.5);z-index:2;}',
            '.customs-theme-hybrid .customs-filmix-filter-btn.focus .customs-filmix-filter-icon{stroke:#000 !important;opacity:1 !important;}',
            '.customs-theme-hybrid .customs-filmix-filter-btn.focus .customs-filmix-filter-label{color:rgba(0,0,0,0.7) !important;}',
            '.customs-theme-hybrid .customs-filmix-filter-btn.focus .customs-filmix-filter-val{color:#000 !important;}',
            '.customs-theme-hybrid .customs-filmix-filter-btn.focus .customs-filmix-filter-arrow{stroke:#000 !important;opacity:.8 !important;}',
            '.customs-theme-hybrid .customs-filmix-item{background:rgba(20,25,35,0.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.16);box-shadow:0 8px 24px rgba(0,0,0,0.35),inset 0 1px 1px rgba(255,255,255,0.12);}',
            '.customs-theme-hybrid .customs-filmix-item.focus{background:rgba(30,40,60,0.85);border-color:rgba(255,255,255,0.95);transform:scale(1.05);box-shadow:0 14px 35px rgba(0,0,0,0.6),0 0 25px rgba(255,255,255,0.25);z-index:5;}',
            '.customs-theme-hybrid .customs-filmix-skeleton{background:rgba(20,25,35,0.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.12);}',

            /* Базові стилі карток Filmix */
            '.customs-filmix-item{position:relative;flex-shrink:0;width:18.5em;margin-right:1.2em;' +
                'background:rgba(20,25,35,0.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);' +
                'border:1px solid rgba(255,255,255,0.14);border-radius:1em;padding:.85em 1em;cursor:pointer;' +
                'box-shadow:0 8px 24px rgba(0,0,0,0.35),inset 0 1px 1px rgba(255,255,255,0.12);' +
                'transition:transform .22s cubic-bezier(0.16,1,0.3,1),background .22s ease,border-color .22s ease,box-shadow .22s ease;' +
                'box-sizing:border-box;will-change:transform;}',
            '.customs-filmix-item.focus{border-color:rgba(255,255,255,0.95);transform:scale(1.05);' +
                'box-shadow:0 14px 35px rgba(0,0,0,0.6),0 0 25px rgba(255,255,255,0.22),inset 0 1px 2px rgba(255,255,255,0.4);z-index:5;}',
            '.customs-filmix-item__header{display:flex;align-items:center;justify-content:space-between;gap:.6em;}',
            '.customs-filmix-item__header > div{min-width:0;flex:1;}',
            '.customs-filmix-item__voice-box{display:flex;align-items:center;gap:.5em;min-width:0;flex:1;overflow:hidden;}',
            '.customs-filmix-item__voice-wrap{min-width:0;flex:1;overflow:hidden;white-space:nowrap;display:block;}',
            '.customs-filmix-item__ep-badge{font-size:.72em;font-weight:800;letter-spacing:.05em;padding:.18em .5em;border-radius:.35em;background:rgba(59,130,246,0.22);color:#60a5fa;border:1px solid rgba(59,130,246,0.38);text-transform:uppercase;flex-shrink:0;}',
            '.customs-filmix-item__lang{font-size:.72em;font-weight:800;padding:.15em .45em;border-radius:.35em;flex-shrink:0;letter-spacing:.03em;}',
            '.customs-filmix-item__lang.badge--ua{background:rgba(59,130,246,0.25);color:#93c5fd;border:1px solid rgba(96,165,250,0.4);}',
            '.customs-filmix-item__lang.badge--ru{background:rgba(148,163,184,0.18);color:#cbd5e1;border:1px solid rgba(148,163,184,0.25);}',
            '.customs-filmix-item__lang.badge--en{background:rgba(168,85,247,0.2);color:#d8b4fe;border:1px solid rgba(168,85,247,0.3);}',
            /* Filmix Card Marquee & Typography */
            '.customs-filmix-item__title-wrap{min-width:0;flex:1;overflow:hidden;white-space:nowrap;display:block;position:relative;}',
            '.customs-filmix-item__voice-inner,.customs-filmix-item__title-inner{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transform:translate3d(0,0,0);animation:none;}',
            '.customs-filmix-item:not(.focus) .customs-filmix-item__voice-inner,' +
            '.customs-filmix-item:not(.focus) .customs-filmix-item__title-inner{display:block !important;max-width:100% !important;overflow:hidden !important;text-overflow:ellipsis !important;white-space:nowrap !important;transform:translate3d(0,0,0) !important;animation:none !important;}',
            '.customs-filmix-item__voice-text,.customs-filmix-item__voice-dup{display:inline-block;white-space:nowrap;font-size:.95em;font-weight:700;color:#fff;vertical-align:middle;text-shadow:0 1px 2px rgba(0,0,0,0.4);flex-shrink:0;}',
            '.customs-filmix-item__title-text,.customs-filmix-item__title-dup{display:inline-block;white-space:nowrap;font-size:.95em;font-weight:700;color:#fff;vertical-align:middle;text-shadow:0 1px 2px rgba(0,0,0,0.5);line-height:1.3;flex-shrink:0;}',
            '.customs-filmix-item__voice-sep,.customs-filmix-item__title-sep{display:none;padding:0 .55em;font-size:.85em;color:rgba(255,255,255,0.4);vertical-align:middle;flex-shrink:0;}',
            '.customs-filmix-item__voice-dup,.customs-filmix-item__title-dup{display:none;}',
            '.customs-filmix-item:not(.focus) .customs-filmix-item__voice-dup,' +
            '.customs-filmix-item:not(.focus) .customs-filmix-item__title-dup,' +
            '.customs-filmix-item:not(.focus) .customs-filmix-item__voice-sep,' +
            '.customs-filmix-item:not(.focus) .customs-filmix-item__title-sep{display:none !important;}',
            '.customs-filmix-item.focus .customs-filmix-item__voice-wrap.has-marquee .customs-filmix-item__voice-dup,' +
            '.customs-filmix-item.focus .customs-filmix-item__voice-wrap.has-marquee .customs-filmix-item__voice-sep,' +
            '.customs-filmix-item.focus .customs-filmix-item__title-wrap.has-marquee .customs-filmix-item__title-dup,' +
            '.customs-filmix-item.focus .customs-filmix-item__title-wrap.has-marquee .customs-filmix-item__title-sep{display:inline-block !important;}',
            '.customs-filmix-item.focus .customs-filmix-item__voice-wrap.has-marquee .customs-filmix-item__voice-inner,' +
            '.customs-filmix-item.focus .customs-filmix-item__title-wrap.has-marquee .customs-filmix-item__title-inner{' +
                'display:inline-flex !important;align-items:center !important;max-width:none !important;' +
                'overflow:visible !important;text-overflow:clip !important;white-space:nowrap !important;' +
                'animation:customs-marquee-continuous var(--marquee-dur, 6s) linear infinite !important;' +
                'animation-delay:0.35s !important;will-change:transform;}',
            '@keyframes customs-marquee-continuous{0%{transform:translate3d(0,0,0);}100%{transform:translate3d(-50%,0,0);}}',
            '.customs-filmix-item__ep-sub{font-size:.7em;font-weight:700;color:#93c5fd;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.15em;}',
            '.customs-filmix-item__quality{font-weight:800;padding:.2em .55em;border-radius:.45em;font-size:.75em;flex-shrink:0;letter-spacing:.04em;text-transform:uppercase;}',
            '.customs-filmix-item__quality.q-4k{background:linear-gradient(135deg,#fbbf24 0%,#d97706 100%);color:#000;box-shadow:0 2px 10px rgba(245,158,11,0.4);}',
            '.customs-filmix-item__quality.q-1440{background:linear-gradient(135deg,#c084fc 0%,#7e22ce 100%);color:#fff;box-shadow:0 2px 8px rgba(168,85,247,0.35);}',
            '.customs-filmix-item__quality.q-1080{background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);color:#fff;box-shadow:0 2px 8px rgba(37,99,235,0.35);}',
            '.customs-filmix-item__quality.q-720{background:linear-gradient(135deg,#64748b 0%,#334155 100%);color:#f1f5f9;}',
            '.customs-filmix-item__quality.q-480{background:rgba(255,255,255,0.12);color:#94a3b8;}',
            '.customs-filmix-item__tags{display:flex;align-items:center;gap:.35em;margin-top:.45em;font-size:.7em;font-weight:700;letter-spacing:.04em;overflow:hidden;}',
            '.customs-filmix-tag{padding:.15em .45em;border-radius:.35em;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.1);white-space:nowrap;text-transform:uppercase;}',
            '.customs-filmix-tag.tag--codec{background:rgba(255,255,255,0.08);color:#e2e8f0;}',
            '.customs-filmix-tag.tag--hdr{background:rgba(245,158,11,0.2);color:#fbbf24;border-color:rgba(245,158,11,0.35);}',
            '.customs-filmix-tag.tag--dv{background:rgba(168,85,247,0.25);color:#e9d5ff;border-color:rgba(168,85,247,0.4);}',
            '.customs-filmix-tag.tag--sdr{background:rgba(148,163,184,0.12);color:#94a3b8;}',
            '.customs-filmix-tag.tag--edition{background:rgba(56,189,248,0.15);color:#7dd3fc;border-color:rgba(56,189,248,0.3);}',
            '.customs-filmix-tag.tag--audio{background:rgba(52,211,153,0.15);color:#6ee7b7;border-color:rgba(52,211,153,0.3);}',
            '.customs-filmix-item__divider{height:1px;background:linear-gradient(90deg,rgba(255,255,255,0.16) 0%,rgba(255,255,255,0.03) 100%);margin:.55em 0 .5em 0;}',
            '.customs-filmix-item__footer{display:flex;align-items:center;justify-content:space-between;gap:.5em;font-size:.82em;}',
            '.customs-filmix-item__size-box{display:flex;align-items:center;gap:.4em;color:#34d399;font-weight:700;}',
            '.customs-filmix-item__icon{width:1.1em;height:1.1em;flex-shrink:0;}',
            '.customs-filmix-item__action{display:flex;align-items:center;gap:.3em;color:rgba(255,255,255,0.65);font-weight:600;font-size:.9em;transition:color .2s ease;}',
            '.customs-filmix-item.focus .customs-filmix-item__action{color:#fbbf24;}',
            '.customs-filmix-item__play-icon{width:.9em;height:.9em;fill:currentColor;flex-shrink:0;}',
            '.customs-filmix-item__progress.time-line{margin:0;position:absolute;bottom:0;left:0;right:0;width:100%;height:3px;background:rgba(255,255,255,0.15);overflow:hidden;border-radius:0 0 1em 1em;pointer-events:none;}',
            '.customs-filmix-item__progress.time-line.hide{display:none;}',
            '.customs-filmix-item__progress.time-line > div{height:100%;background:#3b82f6;border-radius:0 0 1em 1em;transition:width .2s ease;}',

            /* Filmix: Скелетони */
            '.customs-filmix-skeleton{position:relative;flex-shrink:0;width:19.5em;margin-right:1.2em;border-radius:1em;overflow:hidden;background:rgba(20,25,35,0.6);border:1px solid rgba(255,255,255,0.1);box-sizing:border-box;display:flex;flex-direction:column;transition:transform .2s ease,border-color .2s ease;}',
            '.customs-filmix-skeleton.focus{border-color:rgba(255,255,255,0.8);transform:scale(1.04);z-index:2;}',
            '.customs-filmix-skeleton--movie{width:18.5em;padding:.85em 1em;height:auto;}',
            '.customs-filmix-skeleton__thumb{width:100%;height:10.5em;background:rgba(255,255,255,0.06);animation:customs-pulse 2.2s ease-in-out infinite;}',
            '.customs-filmix-skeleton__body{padding:.8em .95em .85em .95em;display:flex;flex-direction:column;gap:.65em;flex:1;}',
            '.customs-filmix-skeleton--movie .customs-filmix-skeleton__body{padding:0;}',
            '.customs-filmix-skeleton__line{border-radius:.4em;background:rgba(255,255,255,0.07);animation:customs-pulse 2.2s ease-in-out infinite;}',
            '.customs-filmix-skeleton__line--title{height:1.15em;width:75%;}',
            '.customs-filmix-skeleton__line--tags{height:.8em;width:45%;}',
            '.customs-filmix-skeleton__line--foot{height:.9em;width:90%;}',

            /* 1. Варіант Cinema (Apple TV Style) */
            '.customs-filmix-item--cinema{width:19.5em;padding:0;overflow:hidden;display:flex;flex-direction:column;}',
            '.customs-filmix-thumb{position:relative;width:100%;height:10.5em;background:#1e293b;overflow:hidden;}',
            '.customs-filmix-thumb__img{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s ease,transform .3s ease;}',
            '.customs-filmix-thumb__img.loaded{opacity:1;}',
            '.customs-filmix-item--cinema.focus .customs-filmix-thumb__img{transform:scale(1.05);}',
            '.customs-filmix-thumb__overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.3) 0%,transparent 40%,rgba(11,15,20,0.85) 100%);pointer-events:none;}',
            '.customs-filmix-thumb .customs-filmix-item__ep-badge{position:absolute;top:.6em;left:.6em;background:rgba(10,15,25,0.85);border:1px solid rgba(255,255,255,0.25);color:#fff;z-index:2;}',
            '.customs-filmix-thumb .customs-filmix-item__quality{position:absolute;top:.6em;right:.6em;z-index:2;}',
            '.customs-filmix-item--cinema .customs-filmix-item__content{padding:.8em .95em .85em .95em;display:flex;flex-direction:column;flex:1;justify-content:space-between;}',

            /* 2. Варіант Glass Backdrop */
            '.customs-filmix-item--backdrop{width:19.5em;height:8.8em;padding:0;overflow:hidden;position:relative;display:flex;flex-direction:column;justify-content:space-between;}',
            '.customs-filmix-backdrop-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;filter:brightness(0.4) saturate(140%) blur(1.5px);transition:opacity .35s ease,transform .3s ease,filter .3s ease;}',
            '.customs-filmix-backdrop-bg.loaded{opacity:1;}',
            '.customs-filmix-item--backdrop.focus .customs-filmix-backdrop-bg{transform:scale(1.07);filter:brightness(0.5) saturate(150%) blur(0.5px);}',
            '.customs-filmix-backdrop-glass{position:absolute;inset:0;background:linear-gradient(135deg,rgba(15,23,42,0.8) 0%,rgba(15,23,42,0.95) 100%);}',
            '.customs-filmix-item--backdrop .customs-filmix-item__content{position:relative;z-index:2;padding:.85em 1em;display:flex;flex-direction:column;justify-content:space-between;height:100%;box-sizing:border-box;}',

            /* 3. Варіант Horizontal Split */
            '.customs-filmix-item--horizontal{width:22.5em;height:7.8em;padding:0;overflow:hidden;display:flex;flex-direction:row;}',
            '.customs-filmix-split-left{width:42%;position:relative;background:#1e293b;overflow:hidden;flex-shrink:0;}',
            '.customs-filmix-split__img{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .35s ease,transform .3s ease;}',
            '.customs-filmix-split__img.loaded{opacity:1;}',
            '.customs-filmix-item--horizontal.focus .customs-filmix-split__img{transform:scale(1.06);}',
            '.customs-filmix-split-left .customs-filmix-item__ep-badge{position:absolute;bottom:.5em;left:.5em;background:rgba(10,15,25,0.85);border:1px solid rgba(255,255,255,0.25);color:#fff;z-index:2;}',
            '.customs-filmix-split-right{flex:1;min-width:0;padding:.75em .85em;display:flex;flex-direction:column;justify-content:space-between;}',

            /* Торренти TorrServer & Кнопка в Джерело */
            '.full-start__button.view--customs-torrents svg{width:1.3em;height:1.3em;stroke:currentColor;fill:none;margin-right:.4em;vertical-align:middle;}',
            '.customs-torrents .scroll__body{display:flex;}',
            '.customs-torrents .scroll__content{padding-top:.5em;padding-bottom:.8em;}',
            '.customs-torrent-card{position:relative;flex-shrink:0;width:21em;min-height:9.5em;margin-right:1.3em;padding:1em 1.2em;border-radius:1.1em;background:#16191d;border:1px solid rgba(255,255,255,.09);box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;justify-content:space-between;transition:transform .2s ease, border-color .2s ease, background-color .2s ease;}',
            '.customs-torrent-card.focus{background:#1f252c;border-color:rgba(255,255,255,.45);box-shadow:0 0 0 .25em rgba(255,255,255,.9), 0 12px 30px rgba(0,0,0,.6);transform:scale(1.02);}',
            '.customs-torrent-card__title{font-size:1.05em;font-weight:600;line-height:1.3;color:#f0f2f5;max-height:2.6em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
            '.customs-torrent-card__badges{display:flex;align-items:center;flex-wrap:wrap;gap:.4em;margin-top:.6em;}',
            '.customs-torrent-tag{display:inline-block;padding:.18em .55em;border-radius:.4em;font-size:.78em;font-weight:600;line-height:1.2;letter-spacing:.02em;}',
            '.customs-torrent-tag--season{background:rgba(255,255,255,.16);color:#fff;}',
            '.customs-torrent-tag--quality{border:1px solid rgba(255,255,255,.3);color:#e0e4eb;}',
            '.customs-torrent-tag--codec{background:rgba(255,255,255,.07);color:#9aa3af;}',
            '.customs-torrent-tag--ukr{background:rgba(245,158,11,.18);color:#fbbf24;border:1px solid rgba(245,158,11,.35);}',
            '.customs-torrent-card__foot{display:flex;align-items:center;justify-content:space-between;margin-top:.8em;padding-top:.65em;border-top:1px solid rgba(255,255,255,.07);font-size:.82em;}',
            '.customs-torrent-card__meta{display:flex;align-items:center;gap:.5em;color:#8b949e;}',
            '.customs-torrent-tracker{text-transform:uppercase;padding:.12em .45em;border-radius:.35em;background:rgba(59,130,246,.15);color:#93c5fd;font-size:.85em;font-weight:700;}',
            '.customs-torrent-seeds{font-weight:600;color:#c9d1d9;}',
            '.customs-torrent-card__status{display:flex;align-items:center;gap:.6em;}',
            '.customs-torrent-size{padding:.2em .65em;border-radius:.4em;background:#ffffff;color:#000000;font-weight:800;font-size:.9em;letter-spacing:-.02em;}',
            '.customs-torrent-speed{display:inline-flex;align-items:center;gap:.4em;padding:.18em .55em;border-radius:.4em;font-weight:700;font-size:.82em;transition:all .2s ease;}',
            '.customs-speed-dot{display:inline-block;width:.55em;height:.55em;border-radius:50%;background:currentColor;}',
            '.customs-speed--idle{background:rgba(255,255,255,.08);color:#8b949e;}',
            '.customs-speed--testing{background:rgba(59,130,246,.2);color:#60a5fa;}',
            '.customs-speed--green{background:rgba(16,185,129,.2);color:#34d399;border:1px solid rgba(16,185,129,.4);}',
            '.customs-speed--yellow{background:rgba(245,158,11,.2);color:#fbbf24;border:1px solid rgba(245,158,11,.4);}',
            '.customs-speed--red{background:rgba(239,68,68,.2);color:#f87171;border:1px solid rgba(239,68,68,.35);}',
            '.customs-speed--offline{background:rgba(239,68,68,.25);color:#fca5a5;border:1px solid rgba(239,68,68,.5);}',
            '.customs-torrent-skeleton{flex-shrink:0;width:21em;min-height:9.5em;margin-right:1.3em;padding:1em 1.2em;border-radius:1.1em;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;justify-content:space-between;animation:customs-pulse 2.2s ease-in-out infinite;}',
            '.customs-torrent-skeleton__title{height:1.2em;width:85%;border-radius:.4em;background:rgba(255,255,255,.08);}',
            '.customs-torrent-skeleton__badges{height:1em;width:50%;border-radius:.3em;background:rgba(255,255,255,.06);margin-top:.6em;}',
            '.customs-torrent-skeleton__foot{display:flex;justify-content:space-between;align-items:center;margin-top:.8em;}',
            '.customs-torrent-skeleton__meta{height:1em;width:40%;border-radius:.3em;background:rgba(255,255,255,.06);}',
            '.customs-torrent-skeleton__size{height:1.2em;width:25%;border-radius:.4em;background:rgba(255,255,255,.08);}',
            '.customs-torrent-card--more{justify-content:center;align-items:center;text-align:center;background:rgba(255,255,255,.05);border:1px dashed rgba(255,255,255,.25);cursor:pointer;}',
            '.customs-torrent-card--more.focus{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.8);}',
            '.customs-torrent-more-icon{font-size:2em;margin-bottom:.2em;}',
            '.customs-torrent-more-title{font-size:1.1em;font-weight:700;color:#fff;}',
            '.customs-torrent-more-sub{font-size:.85em;color:#8b949e;margin-top:.3em;}',

            /* Повноекранний екран Customs Torrents (2-колонковий Cinema Glass) */
            '.customs-torrents-screen{position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;width:100vw !important;height:100vh !important;background:#0c0f12 !important;color:#f3f4f6 !important;display:flex !important;flex-direction:row !important;font-family:sans-serif !important;z-index:9999 !important;box-sizing:border-box !important;overflow:hidden !important;}',

            /* Ліва колонка: Інфо про фільм/серіал */
            '.customs-ts-sidebar{width:26em !important;min-width:22em !important;max-width:28em !important;height:100vh !important;padding:2.2em 2em 3em !important;box-sizing:border-box !important;display:flex !important;flex-direction:column !important;gap:.75em !important;overflow-y:auto !important;border-right:1px solid rgba(255,255,255,.07) !important;background:rgba(14,18,22,.98) !important;flex-shrink:0 !important;}',
            '.customs-ts-poster-wrap{width:100% !important;display:flex !important;justify-content:flex-start !important;margin-bottom:.4em !important;}',
            '.customs-ts-poster{width:13.5em !important;height:20em !important;border-radius:1em !important;object-fit:cover !important;box-shadow:0 10px 30px rgba(0,0,0,.6) !important;border:1px solid rgba(255,255,255,.12) !important;}',
            '.customs-ts-meta-line{display:flex !important;align-items:center !important;gap:.6em !important;font-size:.95em !important;color:#9ca3af !important;font-weight:600 !important;}',
            '.customs-ts-meta-sep{color:#4b5563 !important;font-size:.8em !important;}',
            '.customs-ts-rate-line{display:flex !important;align-items:center !important;gap:.8em !important;margin-top:.2em !important;}',
            '.customs-ts-rate{font-size:1.15em !important;font-weight:800 !important;color:#fbbf24 !important;display:flex !important;align-items:center !important;gap:.3em !important;}',
            '.customs-ts-age{font-size:.8em !important;font-weight:700 !important;color:#d1d5db !important;border:1px solid rgba(255,255,255,.2) !important;padding:.15em .5em !important;border-radius:.35em !important;background:rgba(255,255,255,.05) !important;}',
            '.customs-ts-title{font-size:1.55em !important;font-weight:800 !important;color:#ffffff !important;line-height:1.25 !important;margin-top:.2em !important;word-break:break-word !important;}',
            '.customs-ts-genres{font-size:.9em !important;color:#8b949e !important;line-height:1.4 !important;}',
            '.customs-ts-descr{font-size:.86em !important;color:#6b7280 !important;line-height:1.5 !important;overflow:hidden !important;display:-webkit-box !important;-webkit-line-clamp:6 !important;-webkit-box-orient:vertical !important;margin-top:.4em !important;}',

            /* Права колонка: Керування та роздачі */
            '.customs-ts-main{flex:1 1 auto !important;height:100vh !important;display:flex !important;flex-direction:column !important;overflow:hidden !important;position:relative !important;}',
            '.customs-ts-head{padding:1.6em 2.2em 1.2em !important;border-bottom:1px solid rgba(255,255,255,.07) !important;background:rgba(12,15,18,.98) !important;display:flex !important;align-items:center !important;justify-content:space-between !important;gap:1em !important;flex-shrink:0 !important;}',
            '.customs-ts-head__controls{display:flex !important;align-items:center !important;gap:.7em !important;flex-wrap:wrap !important;}',
            '.customs-ts-autotest-status{display:flex !important;align-items:center !important;gap:.5em !important;padding:.45em .9em !important;border-radius:.75em !important;background:rgba(255,255,255,.05) !important;border:1px solid rgba(255,255,255,.1) !important;font-size:.85em !important;color:#9ca3af !important;white-space:nowrap !important;margin-left:auto !important;}',
            '.customs-ts-autotest-val{color:#e5e7eb !important;font-weight:700 !important;}',
            '.customs-autotest-pulse{color:#60a5fa !important;animation:customs-live-pulse 1.4s infinite ease-in-out !important;font-weight:700 !important;}',
            '.customs-ts-ctrl{padding:.5em 1em;border-radius:.75em;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#d1d5db;font-size:.88em;font-weight:600;cursor:pointer;transition:all .18s ease;display:flex;align-items:center;gap:.4em;}',
            '.customs-ts-ctrl.focus{background:rgba(255,255,255,.22);border-color:rgba(255,255,255,.5);color:#fff;box-shadow:0 0 0 .2em rgba(255,255,255,.8);transform:scale(1.03);}',
            '.customs-ts-ctrl.active{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.35);color:#ffffff;font-weight:700;}',
            '.customs-ts-ctrl__label{color:#9ca3af;font-size:.9em;}',
            '.customs-ts-ctrl__val{color:#fff;font-weight:700;}',
            '.customs-ts-body{flex:1 1 auto !important;position:relative !important;width:100% !important;height:calc(100vh - 5em) !important;min-height:20em !important;overflow:hidden !important;padding:0 !important;box-sizing:border-box !important;}',
            '.customs-ts-body .scroll{position:absolute !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;width:100% !important;height:100% !important;max-height:none !important;overflow:hidden !important;display:block !important;}',
            '.customs-ts-body .scroll__content{width:100% !important;padding:1.2em 2.2em 5em !important;box-sizing:border-box !important;}',
            '.customs-ts-body .scroll__body{width:100% !important;display:flex !important;flex-direction:column !important;gap:.8em !important;box-sizing:border-box !important;}',
            '.customs-ts-card{width:100% !important;box-sizing:border-box !important;flex-shrink:0 !important;margin-bottom:0 !important;background:#181c20;border:1px solid rgba(255,255,255,.08);border-radius:1.1em;padding:1.1em 1.3em;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:transform .18s ease, border-color .18s ease, background-color .18s ease;cursor:pointer;display:flex;flex-direction:column;gap:.6em;}',
            '.customs-ts-card.focus{background:#20262e;border-color:rgba(255,255,255,.45);box-shadow:0 0 0 .22em rgba(255,255,255,.9), 0 12px 30px rgba(0,0,0,.6);transform:scale(1.015);}',
            '.customs-ts-card__title{font-size:1.05em;font-weight:600;color:#f3f4f6;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
            '.customs-ts-card__badges{display:flex;align-items:center;flex-wrap:wrap;gap:.45em;}',
            '.customs-ts-tag{display:inline-block;padding:.2em .6em;border-radius:.4em;font-size:.78em;font-weight:600;line-height:1.2;letter-spacing:.02em;}',
            '.customs-ts-tag--season{background:rgba(255,255,255,.18);color:#ffffff;font-weight:700;}',
            '.customs-ts-tag--episodes{background:rgba(0,0,0,.45);color:#9ca3af;border:1px solid rgba(255,255,255,.15);font-weight:600;}',
            '.customs-ts-tag--quality{border:1px solid rgba(255,255,255,.3);color:#e5e7eb;font-weight:600;}',
            '.customs-ts-tag--q-4k{background:linear-gradient(135deg, rgba(245,158,11,.3), rgba(217,119,6,.2)) !important;color:#fbbf24 !important;border:1px solid rgba(245,158,11,.5) !important;font-weight:800 !important;}',
            '.customs-ts-tag--q-fhd{background:linear-gradient(135deg, rgba(59,130,246,.25), rgba(37,99,235,.15)) !important;color:#60a5fa !important;border:1px solid rgba(59,130,246,.4) !important;font-weight:700 !important;}',
            '.customs-ts-tag--voice{background:rgba(139,92,246,.18);color:#c084fc;border:1px solid rgba(139,92,246,.35);font-weight:600;}',
            '.customs-ts-tag--codec{background:rgba(255,255,255,.06);color:#9ca3af;}',
            '.customs-ts-tag--ukr{background:rgba(245,158,11,.18);color:#fbbf24;border:1px solid rgba(245,158,11,.35);font-weight:700;}',
            '.customs-ts-tag--tracker{text-transform:uppercase;padding:.15em .5em;border-radius:.35em;background:rgba(59,130,246,.15);color:#93c5fd;font-size:.85em;font-weight:700;border:1px solid rgba(59,130,246,.25);}',
            '.customs-ts-date{color:#6b7280;font-size:.88em;margin-left:.3em;}',
            '.customs-ts-card__footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.8em;margin-top:.4em;padding-top:.7em;border-top:1px solid rgba(255,255,255,.06);font-size:.84em;}',
            '.customs-ts-card__meta-left{display:flex;align-items:center;gap:.6em;color:#8b949e;}',
            '.customs-ts-card__meta-right{display:flex;align-items:center;gap:.9em;margin-left:auto;}',
            '.customs-ts-stat{display:flex;align-items:center;gap:.35em;color:#8b949e;}',
            '.customs-ts-stat__val{font-weight:700;padding:.15em .45em;border-radius:.35em;background:rgba(255,255,255,.08);color:#e5e7eb;}',
            '.customs-ts-stat__val--seeds{color:#ffffff;background:rgba(255,255,255,.14);}',
            '.customs-ts-size{padding:.25em .7em;border-radius:.4em;background:#ffffff;color:#000000;font-weight:800;font-size:.92em;letter-spacing:-.02em;box-shadow:0 2px 6px rgba(0,0,0,.4);white-space:nowrap;}',
            '.customs-speed-badge{display:inline-flex;align-items:center;gap:.4em;padding:.22em .65em;border-radius:.45em;font-weight:700;font-size:.82em;border:1px solid transparent;transition:all .18s ease;white-space:nowrap;cursor:pointer;}',
            '.customs-subbadge{font-size:.82em;font-weight:500;opacity:.9;padding:.1em .35em;border-radius:.3em;background:rgba(0,0,0,.25);margin-left:.2em;}',
            '@keyframes customs-live-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(1.2);}}',
            '.customs-speed--green .customs-speed-dot{animation:customs-live-pulse 1.8s infinite ease-in-out;}',
            '.customs-ts-card--skel{min-height:7em;background:rgba(255,255,255,.03);animation:customs-pulse 2.2s infinite ease-in-out;}',
            '.customs-ts-skel-line{border-radius:.35em;background:rgba(255,255,255,.06);}',
            '.customs-ts-skel-title{height:1.2em;width:75%;}',
            '.customs-ts-skel-badges{height:1em;width:40%;margin-top:.5em;}',
            '.customs-ts-skel-foot{height:1.1em;width:60%;margin-top:.8em;}',
            '.customs-ts-empty{padding:4em 2em;text-align:center;color:#9ca3af;}',
            '.customs-ts-empty__icon{font-size:3em;margin-bottom:.4em;}',
            '.customs-ts-empty__title{font-size:1.3em;font-weight:700;color:#fff;}',
            '.customs-ts-empty__desc{font-size:.9em;margin-top:.4em;color:#6b7280;}',

            '.items-line.customs-strip-hidden{display:none !important;}'
        ].join('\n');

        var old = document.getElementById('lampa-customs-style');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        var style = document.createElement('style');
        style.id = 'lampa-customs-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function applyMainStripsDomFilter() {
        if (!flag('customs_main_strips_filter_enabled', true)) return;
        try {
            var lines = $('.activity.main .items-line');
            lines.each(function () {
                var el = $(this);
                var title = el.find('.items-line__title').text().trim();
                if (title) {
                    var sid = getStripId(title);
                    if (!isStripVisible(sid)) {
                        el.addClass('customs-strip-hidden');
                    } else {
                        el.removeClass('customs-strip-hidden');
                    }
                }
            });
        } catch (e) {}
    }

    function initMainStripsHook() {
        if (!Lampa.Api || !Lampa.Api.main) return;
        var origApiMain = Lampa.Api.main;

        function processLines(lines) {
            if (!Array.isArray(lines)) return lines;
            if (!flag('customs_main_strips_filter_enabled', true)) return lines;

            // 1. Фільтрація прихованих смужок
            var filtered = lines.filter(function (line) {
                if (!line) return false;
                var sid = getStripId(line.title);
                return isStripVisible(sid);
            });

            // 2. Сортування смужок за користувацьким порядком
            var order = getMainStripsOrder();
            filtered.sort(function (a, b) {
                var sA = getStripId(a.title);
                var sB = getStripId(b.title);
                var idxA = order.indexOf(sA);
                var idxB = order.indexOf(sB);
                if (idxA === -1) idxA = 999;
                if (idxB === -1) idxB = 999;
                return idxA - idxB;
            });

            return filtered;
        }

        Lampa.Api.main = function (params, oncomplite, onerror) {
            var wrappedOnComplite = function (data) {
                if (Array.isArray(data)) {
                    data = processLines(data);
                }
                oncomplite(data);
            };

            var nextFn = origApiMain(params, wrappedOnComplite, onerror);

            if (typeof nextFn === 'function') {
                return function (resolve, reject) {
                    nextFn(function (moreData) {
                        if (Array.isArray(moreData)) {
                            moreData = processLines(moreData);
                        }
                        resolve(moreData);
                    }, reject);
                };
            }
            return nextFn;
        };

        // DOM-хук на випадок сторонніх плагінів або закладок
        Lampa.Listener.follow('activity', function (e) {
            if (e.type === 'start' && e.object && e.object.component === 'main') {
                setTimeout(function () {
                    applyMainStripsDomFilter();
                }, 400);
            }
        });
    }

    function start() {
        try {
            if (!window.lampa_settings) window.lampa_settings = {};
            window.lampa_settings.torrents_use = true;
            window.lampa_settings.demo = false;
            window.lampa_settings.read_only = false;
        } catch (eSettings) {}
        addStyle();
        addSettings();
        registerManifestAndName();
        initMainStripsHook();
        if (Lampa.Component && Lampa.Component.add) {
            Lampa.Component.add('customs_torrents_screen', CustomsTorrentsComponent);
        }
        Lampa.Listener.follow('full', onFull);

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('⚡️ Lampa Customs v' + PLUGIN_VERSION + ' (' + PLUGIN_BUILD + ')');
            }
        } catch (eNoty) {}
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();
