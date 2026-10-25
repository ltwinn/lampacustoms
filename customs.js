/*
 * Lampa Customs (customs.js)
 * 1. Стрічка трейлерів: TMDB (UA, RU, EN) + YouTube резерв (відразу під обкладинкою).
 * 2. Filmix швидкий перегляд: доступні варіанти озвучки, якість (4K/1080p/720p), орієнтовний розмір файлу та прямий запуск.
 * Сумісність з ES5 для телевізорів (Tizen, webOS, Android TV).
 */
(function () {
    'use strict';

    var PLUGIN_VERSION = '1.2.2';
    window.lampa_customs_plugin = PLUGIN_VERSION;

    var COMPONENT_NAME = 'lampa_customs';
    var ROW_TRAILERS = 'customs_trailers';
    var ROW_FILMIX = 'customs_filmix';

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

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: COMPONENT_NAME,
            name: 'Lampa Customs v' + PLUGIN_VERSION,
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>'
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

    // 2. Трейлери: ЗАВЖДИ ДРУГИМИ (слідом за Filmix)
    function insertTrailersRow(link, row) {
        var first = link.items && link.items[0];
        if (!first || !link.rows) return;
        if (link.rows.indexOf(ROW_TRAILERS) !== -1) return;

        var startDom = first.render(true);
        var filmixIdx = link.rows.indexOf(ROW_FILMIX);
        var insertIndex = 1;
        var anchorDom = startDom;

        // Якщо Filmix вже є на сторінці — вставляємо після Filmix
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

        // 2. Трейлери: Вставляємо скелетон ВІДРАЗУ слідом за Filmix
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
            '.customs-filmix-split-right{flex:1;min-width:0;padding:.75em .85em;display:flex;flex-direction:column;justify-content:space-between;}'
        ].join('\n');

        var old = document.getElementById('lampa-customs-style');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        var style = document.createElement('style');
        style.id = 'lampa-customs-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function start() {
        addStyle();
        addSettings();
        registerManifestAndName();
        Lampa.Listener.follow('full', onFull);
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();
