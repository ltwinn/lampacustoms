/*
 * Lampa Customs
 * 1. Трейлери для Lampa: українською, а за вибором у налаштуваннях — ще російською й англійською (TMDB + YouTube).
 * 2. Filmix швидкий перегляд: стрічка доступних варіантів відео (озвучка, якість 4K/1080p/720p, орієнтовний розмір) з миттєвим запуском.
 * ES5 синтаксис — для стабільної роботи на Smart TV (Tizen, webOS, Android TV).
 */
(function () {
    'use strict';

    if (window.lampa_customs_plugin) return;
    window.lampa_customs_plugin = true;

    var COMPONENT_NAME = 'lampa_customs';
    var ROW_TRAILERS = 'customs_trailers';
    var ROW_FILMIX = 'customs_filmix';

    var CACHE_KEY = 'ua_trailers_cache_v3';
    var CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
    var CACHE_LIMIT = 300;

    var CYRILLIC = /[а-яёіїєґ]/i;
    var UA_LETTERS = /[іїєґ]/i;
    var UA_WORDS = /укр|україн|\bua\b/i;

    function isUkrainian(title) {
        return UA_LETTERS.test(title) || UA_WORDS.test(title);
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
            name: 'Lampa Customs',
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>'
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

        // Розділ: Трейлери
        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_title_trailers', type: 'title' },
            field: { name: 'Стрічка трейлерів' }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: { name: 'customs_trailers_enabled', type: 'trigger', default: true },
            field: { name: 'Увімкнути трейлери', description: 'Стрічка трейлерів з TMDB та YouTube' }
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
    }

    // Реєстрація маніфесту та відображення назви "Lampa Customs" у розділі "Розширення"
    function registerManifestAndName() {
        var manifest = {
            type: 'video',
            version: '1.2.0',
            name: 'Lampa Customs',
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

        // Оновлюємо ім'я плагіна в картці списку розширень Lampa (замість "Без назви")
        try {
            var plugins = Lampa.Storage.get('plugins', []);
            var changed = false;
            plugins.forEach(function (p) {
                if (p && p.url && (p.url.indexOf('lampacustoms') !== -1 || p.url.indexOf('trailers.js') !== -1 || p.url.indexOf('customs') !== -1)) {
                    if (p.name !== 'Lampa Customs') {
                        p.name = 'Lampa Customs';
                        changed = true;
                    }
                }
            });
            if (changed) Lampa.Storage.set('plugins', plugins);
        } catch (e) {}
    }

    // ---------- Кеш пошуку YouTube ----------

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

    function calculateSize(quality, runtimeMinutes) {
        if (!runtimeMinutes) runtimeMinutes = 115;
        var q = parseInt(quality) || 1080;
        var bitrate = 5000;
        if (q >= 2160) bitrate = 20000;
        else if (q >= 1440) bitrate = 11000;
        else if (q >= 1080) bitrate = 5500;
        else if (q >= 720) bitrate = 2400;
        else bitrate = 1200;

        var sizeMB = (bitrate * (runtimeMinutes * 60)) / (8 * 1024);
        if (sizeMB >= 1024) return (sizeMB / 1024).toFixed(1) + ' ГБ';
        return Math.round(sizeMB) + ' МБ';
    }

    var PROXY_WORKER = 'https://cors.nb557.workers.dev/';
    function makeProxyUrl(url) {
        if (Lampa.Platform.is('android')) return url;
        var pos = url.indexOf('://');
        if (pos !== -1) {
            var after = url.substring(pos + 3);
            return PROXY_WORKER + 'enc2t/' + encodeURIComponent(btoa(after));
        }
        return PROXY_WORKER + url;
    }

    function searchFilmix(movie, done) {
        var token = Lampa.Storage.get('filmix_token', '') + '';
        var dev_id = '8a' + Math.random().toString(16).substring(2, 16);
        var dev_token = '?user_dev_id=' + dev_id + '&user_dev_name=Xiaomi&user_dev_token=' + (token || 'aaaabbbbccccddddeeeeffffaaaabbbb') + '&user_dev_vendor=Xiaomi&user_dev_os=14&user_dev_apk=2.2.0&app_lang=ru-rRU';

        var title = cleanTitle(movie.title || movie.name);
        var searchUrl = 'http://filmixapp.cyou/api/v2/search' + dev_token + '&story=' + encodeURIComponent(title);

        var req = new Lampa.Reguest();
        req.timeout(12000);
        req.native(makeProxyUrl(searchUrl), function (json) {
            if (json && json.length && json[0] && json[0].id) {
                loadFilmixPost(json[0].id, dev_token, movie, done);
            } else {
                done([]);
            }
        }, function () {
            done([]);
        });
    }

    function loadFilmixPost(id, dev_token, movie, done) {
        var postUrl = 'http://filmixapp.cyou/api/v2/post/' + id + dev_token;
        var req = new Lampa.Reguest();
        req.timeout(12000);
        req.native(makeProxyUrl(postUrl), function (data) {
            var streams = [];
            var maxQ = (window.mod_filmix && window.mod_filmix.max_qualitie) || 1080;
            var showSize = flag('customs_filmix_show_size', true);

            if (data && data.player_links && data.player_links.movie) {
                var m = data.player_links.movie;
                for (var key in m) {
                    var item = m[key];
                    if (item.translation === 'Заблокировано правообладателем!') continue;

                    var link = item.link || '';
                    var matchQ = link.match(/\[([\d,]*)\]\.mp4/i);
                    var qualities = matchQ ? matchQ[1].split(',').map(Number).filter(function (q) { return q <= maxQ; }) : [720];
                    qualities.sort(function (a, b) { return b - a; });

                    qualities.forEach(function (q) {
                        var playUrl = link.replace(/\[[\d,]*\](\.mp4)/i, q + '$1');
                        streams.push({
                            voice: item.translation || 'Дубляж / Переклад',
                            quality: q >= 2160 ? '4K UHD' : q + 'p',
                            raw_quality: q,
                            url: playUrl,
                            size: showSize ? calculateSize(q, movie.runtime) : ''
                        });
                    });
                }
            } else if (data && data.player_links && data.player_links.playlist) {
                // Серіали: виводимо доступні варіанти перекладу з першою серією
                var pl = data.player_links.playlist;
                var firstSeasonKey = Object.keys(pl)[0];
                if (firstSeasonKey && pl[firstSeasonKey]) {
                    var voices = pl[firstSeasonKey];
                    for (var vKey in voices) {
                        var eps = voices[vKey];
                        var firstEp = eps[Object.keys(eps)[0]];
                        if (firstEp && firstEp.link) {
                            var qList = (firstEp.qualities || []).filter(function (q) { return q <= maxQ; });
                            qList.sort(function (a, b) { return b - a; });
                            var bestQ = qList[0] || 720;
                            var playLink = firstEp.link.replace(/%s/i, bestQ);
                            streams.push({
                                voice: vKey || 'Серіал',
                                quality: bestQ >= 2160 ? '4K UHD' : bestQ + 'p',
                                raw_quality: bestQ,
                                url: playLink,
                                size: ''
                            });
                        }
                    }
                }
            }
            done(streams);
        }, function () {
            done([]);
        });
    }

    function createFilmixRow(list, movie) {
        var row = new Lampa.Emit();
        var html = Lampa.Template.get('items_line', { title: 'Filmix — Швидкий перегляд' });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 260 });
        var last = null;

        html.addClass('customs-filmix');

        list.forEach(function (v) {
            var qClass = v.raw_quality >= 2160 ? 'q-4k' : (v.raw_quality >= 1080 ? 'q-1080' : 'q-720');
            var el = $('<div class="customs-filmix-item selector">' +
                '<div class="customs-filmix-item__inner">' +
                    '<div class="customs-filmix-item__voice"></div>' +
                    '<div class="customs-filmix-item__meta">' +
                        '<span class="customs-filmix-item__quality ' + qClass + '"></span>' +
                        '<span class="customs-filmix-item__size"></span>' +
                    '</div>' +
                '</div>' +
            '</div>');

            el.find('.customs-filmix-item__voice').text(v.voice);
            el.find('.customs-filmix-item__quality').text(v.quality);
            el.find('.customs-filmix-item__size').text(v.size ? '~' + v.size : '');

            el.on('hover:focus', function () {
                last = el[0];
                scroll.update(el, true);
            });

            el.on('hover:enter', function () {
                last = el[0];
                row.toggle();
                Lampa.Player.play({
                    title: (movie.title || movie.name) + ' — ' + v.voice + ' [' + v.quality + ']',
                    url: v.url,
                    timeline: movie.timeline
                });
            });

            scroll.append(el[0]);
        });

        html.find('.items-line__body').append(scroll.render(true));

        row.create = function () {};
        row.render = function (js) { return js ? html[0] : html; };

        row.toggle = function () {
            Lampa.Controller.add(ROW_FILMIX, {
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

            Lampa.Controller.toggle(ROW_FILMIX);
        };

        row.destroy = function () {
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    // ---------- Вставка рядків на сторінку ----------

    function insertRow(link, row, rowName, preferredIndex) {
        var first = link.items && link.items[0];
        if (!first || !link.rows) return;

        var index = Math.min(preferredIndex || 1, link.items.length);
        var prevItem = link.items[index - 1];
        var prevDom = prevItem ? prevItem.render(true) : first.render(true);

        row.use({
            onDown: link.emit.bind(link, 'down'),
            onUp: link.emit.bind(link, 'up'),
            onBack: link.emit.bind(link, 'back'),
            onLeft: link.emit.bind(link, 'left'),
            onActive: function () { link.active = link.items.indexOf(row); },
            onToggle: function () { link.scroll.update(row.render(true)); }
        });

        if (prevDom && prevDom.parentNode) {
            prevDom.parentNode.insertBefore(row.render(true), prevDom.nextSibling);
        }

        link.items.splice(index, 0, row);
        link.rows.splice(index, 0, rowName);
        if (link.active >= index) link.active++;

        if (Lampa.Layer && Lampa.Layer.visible) Lampa.Layer.visible(link.scroll.render(true));
    }

    function onFull(e) {
        if (e.type !== 'complite') return;

        var movie = e.data && e.data.movie;
        var method = e.object && e.object.method;
        if (!movie || !movie.id || (method !== 'movie' && method !== 'tv')) return;

        var page = e.body && e.body[0];
        var network = new Lampa.Reguest();

        // 1. Filmix стрічка (якщо увімкнена)
        if (flag('customs_filmix_enabled', true)) {
            searchFilmix(movie, function (streams) {
                if (!streams.length || !page || !document.body.contains(page)) return;
                insertRow(e.link, createFilmixRow(streams, movie), ROW_FILMIX, 1);
            });
        }

        // 2. Трейлери (якщо увімкнені)
        if (flag('customs_trailers_enabled', true)) {
            var langs = enabledLangs();
            if (langs.length) {
                loadTrailers(network, method, movie.id, langs, function (list) {
                    if (!list.length || !page || !document.body.contains(page)) return;
                    insertRow(e.link, createTrailersRow(list, langs), ROW_TRAILERS, 2);
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

            /* Filmix стрічка */
            '.customs-filmix .scroll__body{display:flex;}',
            '.customs-filmix .scroll__content{padding-top:.5em;padding-bottom:.5em;}',
            '.customs-filmix-item{flex-shrink:0;width:15em;margin-right:1.2em;background:rgba(255,255,255,0.08);' +
                'border:2px solid transparent;border-radius:0.8em;padding:0.8em 1em;cursor:pointer;transition:all .2s ease;}',
            '.customs-filmix-item.focus{background:rgba(255,255,255,0.22);border-color:#fff;transform:scale(1.04);' +
                'box-shadow:0 4px 15px rgba(0,0,0,0.5);}',
            '.customs-filmix-item__voice{font-size:1.05em;font-weight:bold;color:#fff;margin-bottom:0.4em;' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.customs-filmix-item__meta{display:flex;align-items:center;justify-content:space-between;gap:0.5em;font-size:0.85em;}',
            '.customs-filmix-item__quality{font-weight:700;padding:0.15em 0.5em;border-radius:0.4em;font-size:0.85em;}',
            '.customs-filmix-item__quality.q-4k{background:#d4af37;color:#000;}',
            '.customs-filmix-item__quality.q-1080{background:#0078d4;color:#fff;}',
            '.customs-filmix-item__quality.q-720{background:#555;color:#eee;}',
            '.customs-filmix-item__size{color:#46d369;font-weight:600;}'
        ].join('\n');

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
