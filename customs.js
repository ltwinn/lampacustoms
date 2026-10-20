/*
 * Lampa Customs (customs.js)
 * 1. Стрічка трейлерів: TMDB (UA, RU, EN) + YouTube резерв (відразу під обкладинкою).
 * 2. Filmix швидкий перегляд: доступні варіанти озвучки, якість (4K/1080p/720p), орієнтовний розмір файлу та прямий запуск.
 * Сумісність з ES5 для телевізорів (Tizen, webOS, Android TV).
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
    }

    // Реєстрація маніфесту та відображення назви "Lampa Customs"
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

    function searchFilmix(movie, done) {
        var token = Lampa.Storage.get('filmix_token', '') + '';
        var dev_id = '8a' + Math.random().toString(16).substring(2, 16);
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
            var streams = [];
            var maxQ = (window.mod_filmix && window.mod_filmix.max_qualitie) || 2160;
            var showSize = flag('customs_filmix_show_size', true);
            var runtime = parseInt(movie.runtime) || ((movie.episode_run_time && movie.episode_run_time[0]) ? parseInt(movie.episode_run_time[0]) : 115);
            var seen = {};

            if (data && data.player_links) {
                var pl = data.player_links;
                if (pl.movie && pl.movie.length) {
                    // Фільми: доступні переклади та варіанти якості
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
                            if (qm) qualities = [parseInt(qm[1])];
                            else qualities = [720];
                        }

                        // Пріоритет високої чіткості (>= 720p), 480p додається якщо немає вищої якості
                        var highQ = qualities.filter(function (q) { return q >= 720; });
                        var finalQualities = highQ.length ? highQ : qualities;

                        finalQualities.forEach(function (q) {
                            var voice = item.translation || 'Оригінал / Дубляж';
                            var key = voice + '_' + q;
                            if (seen[key]) return;
                            seen[key] = true;

                            var playUrl = m ? item.link.replace(/\[[\d,]*\]/i, q) : item.link;
                            var sizeMB = calculateSizeBytes(q, runtime);

                            streams.push({
                                voice: voice,
                                quality: q >= 2160 ? '4K UHD' : q + 'p',
                                raw_quality: q,
                                size_mb: sizeMB,
                                size: showSize ? formatSize(sizeMB) : '',
                                url: playUrl
                            });
                        });
                    });
                } else if (pl.playlist && Object.keys(pl.playlist).length > 0) {
                    // Серіали: доступні варіанти перекладу з першою серією
                    var sKeys = Object.keys(pl.playlist);
                    var s1 = pl.playlist[sKeys[0]];
                    if (s1) {
                        for (var vKey in s1) {
                            var episodes = s1[vKey];
                            var epKeys = Object.keys(episodes);
                            var ep1 = episodes[epKeys[0]];
                            if (ep1 && ep1.link) {
                                var qList = (ep1.qualities || []).filter(function (q) { return q <= maxQ; });
                                qList.sort(function (a, b) { return b - a; });
                                if (!qList.length) qList = [720];

                                var highQSeries = qList.filter(function (q) { return q >= 720; });
                                var finalQSeries = highQSeries.length ? highQSeries : qList;

                                finalQSeries.forEach(function (q) {
                                    var key = vKey + '_' + q;
                                    if (seen[key]) return;
                                    seen[key] = true;

                                    var playUrl = ep1.link.indexOf('%s') !== -1 ? ep1.link.replace(/%s/i, q) : ep1.link;
                                    var sizeMB = calculateSizeBytes(q, runtime);

                                    streams.push({
                                        voice: vKey,
                                        quality: q >= 2160 ? '4K UHD' : q + 'p',
                                        raw_quality: q,
                                        size_mb: sizeMB,
                                        size: showSize ? formatSize(sizeMB) : '',
                                        url: playUrl
                                    });
                                });
                            }
                        }
                    }
                }
            }

            // Обов'язкове сортування від більшого файлу до меншого
            streams.sort(function (a, b) {
                // 1. Від більшого файлу до меншого
                if (b.size_mb !== a.size_mb) {
                    return b.size_mb - a.size_mb;
                }
                // 2. Якщо раптом однаковий розмір — за якістю відео
                if (b.raw_quality !== a.raw_quality) {
                    return b.raw_quality - a.raw_quality;
                }
                // 3. Пріоритет української озвучки при однаковому розмірі
                var aUa = isUkrainian(a.voice) ? 1 : 0;
                var bUa = isUkrainian(b.voice) ? 1 : 0;
                if (bUa !== aUa) {
                    return bUa - aUa;
                }
                // 4. За назвою перекладу
                return (a.voice || '').localeCompare(b.voice || '');
            });

            done(streams);
        }, function () {
            done([]);
        });
    }

    function createFilmixRow(list, movie) {
        var row = new Lampa.Emit();
        var html = Lampa.Template.get('items_line', { title: 'Filmix — Доступні відео' });
        var scroll = new Lampa.Scroll({ horizontal: true, step: 280 });
        var last = null;

        html.addClass('customs-filmix');

        list.forEach(function (v) {
            var isUa = isUkrainian(v.voice);
            var langBadge = isUa ? '🇺🇦 UA' : (CYRILLIC.test(v.voice) ? 'RU' : 'EN');
            var langClass = isUa ? 'badge--ua' : (langBadge === 'RU' ? 'badge--ru' : 'badge--en');

            var qClass = v.raw_quality >= 2160 ? 'q-4k' : (v.raw_quality >= 1440 ? 'q-1440' : (v.raw_quality >= 1080 ? 'q-1080' : (v.raw_quality >= 720 ? 'q-720' : 'q-480')));
            var qLabel = v.quality;
            if (v.raw_quality >= 2160 && /hdr/i.test(v.voice)) qLabel = '4K HDR';

            var el = $('<div class="customs-filmix-item selector">' +
                '<div class="customs-filmix-item__header">' +
                    '<div class="customs-filmix-item__voice-box">' +
                        '<span class="customs-filmix-item__lang ' + langClass + '">' + langBadge + '</span>' +
                        '<span class="customs-filmix-item__voice"></span>' +
                    '</div>' +
                    '<span class="customs-filmix-item__quality ' + qClass + '">' + qLabel + '</span>' +
                '</div>' +
                '<div class="customs-filmix-item__divider"></div>' +
                '<div class="customs-filmix-item__footer">' +
                    '<div class="customs-filmix-item__size-box">' +
                        '<svg class="customs-filmix-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>' +
                        '<span class="customs-filmix-item__size"></span>' +
                    '</div>' +
                    '<div class="customs-filmix-item__action">' +
                        '<span>Дивитися</span>' +
                        '<svg class="customs-filmix-item__play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
                    '</div>' +
                '</div>' +
            '</div>');

            el.find('.customs-filmix-item__voice').text(v.voice);
            el.find('.customs-filmix-item__size').text(v.size || 'Онлайн');

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
            onToggle: function () { link.scroll.update(row.render(true)); }
        });

        if (startDom && startDom.parentNode) {
            startDom.parentNode.insertBefore(row.render(true), startDom.nextSibling);
        }

        link.items.splice(insertIndex, 0, row);
        link.rows.splice(insertIndex, 0, ROW_FILMIX);
        if (link.active >= insertIndex) link.active++;

        if (Lampa.Layer && Lampa.Layer.visible) Lampa.Layer.visible(link.scroll.render(true));
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
            onToggle: function () { link.scroll.update(row.render(true)); }
        });

        if (anchorDom && anchorDom.parentNode) {
            anchorDom.parentNode.insertBefore(row.render(true), anchorDom.nextSibling);
        }

        link.items.splice(insertIndex, 0, row);
        link.rows.splice(insertIndex, 0, ROW_TRAILERS);
        if (link.active >= insertIndex) link.active++;

        if (Lampa.Layer && Lampa.Layer.visible) Lampa.Layer.visible(link.scroll.render(true));
    }

    function onFull(e) {
        if (e.type !== 'complite') return;

        var movie = e.data && e.data.movie;
        var method = e.object && e.object.method;
        if (!movie || !movie.id || (method !== 'movie' && method !== 'tv')) return;

        var page = e.body && e.body[0];
        var network = new Lampa.Reguest();

        // 1. Filmix файли: ПЕРШІ у списку (відразу під обкладинкою)
        if (flag('customs_filmix_enabled', true)) {
            searchFilmix(movie, function (streams) {
                if (!streams.length || !page || !document.body.contains(page)) return;
                insertFilmixRow(e.link, createFilmixRow(streams, movie));
            });
        }

        // 2. Трейлери: ДРУГІ у списку (слідом за Filmix)
        if (flag('customs_trailers_enabled', true)) {
            var langs = enabledLangs();
            if (langs.length) {
                loadTrailers(network, method, movie.id, langs, function (list) {
                    if (!list.length || !page || !document.body.contains(page)) return;
                    insertTrailersRow(e.link, createTrailersRow(list, langs));
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

            /* Filmix стрічка: Glassmorphism Cinema (Apple TV Style) */
            '.customs-filmix .scroll__body{display:flex;}',
            '.customs-filmix .scroll__content{padding-top:.6em;padding-bottom:.8em;}',
            '.customs-filmix-item{flex-shrink:0;width:17.5em;margin-right:1.2em;' +
                'background:linear-gradient(135deg,rgba(255,255,255,0.11) 0%,rgba(255,255,255,0.03) 100%);' +
                '-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);' +
                'border:1px solid rgba(255,255,255,0.16);border-radius:1em;padding:.85em 1em;cursor:pointer;' +
                'box-shadow:0 8px 24px rgba(0,0,0,0.35),inset 0 1px 1px rgba(255,255,255,0.12);' +
                'transition:transform .22s cubic-bezier(0.16,1,0.3,1),background .22s ease,border-color .22s ease,box-shadow .22s ease;' +
                'box-sizing:border-box;}',
            '.customs-filmix-item.focus{background:linear-gradient(135deg,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0.10) 100%);' +
                'border-color:rgba(255,255,255,0.95);transform:scale(1.05);' +
                'box-shadow:0 14px 35px rgba(0,0,0,0.6),0 0 25px rgba(255,255,255,0.22),inset 0 1px 2px rgba(255,255,255,0.4);z-index:5;}',
            '.customs-filmix-item__header{display:flex;align-items:center;justify-content:space-between;gap:.6em;}',
            '.customs-filmix-item__voice-box{display:flex;align-items:center;gap:.5em;min-width:0;flex:1;}',
            '.customs-filmix-item__lang{font-size:.72em;font-weight:800;padding:.15em .45em;border-radius:.35em;flex-shrink:0;letter-spacing:.03em;}',
            '.customs-filmix-item__lang.badge--ua{background:rgba(59,130,246,0.25);color:#93c5fd;border:1px solid rgba(96,165,250,0.4);}',
            '.customs-filmix-item__lang.badge--ru{background:rgba(148,163,184,0.18);color:#cbd5e1;border:1px solid rgba(148,163,184,0.25);}',
            '.customs-filmix-item__lang.badge--en{background:rgba(168,85,247,0.2);color:#d8b4fe;border:1px solid rgba(168,85,247,0.3);}',
            '.customs-filmix-item__voice{font-size:.95em;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,0.4);}',
            '.customs-filmix-item__quality{font-weight:800;padding:.2em .55em;border-radius:.45em;font-size:.75em;flex-shrink:0;letter-spacing:.04em;text-transform:uppercase;}',
            '.customs-filmix-item__quality.q-4k{background:linear-gradient(135deg,#fbbf24 0%,#d97706 100%);color:#000;box-shadow:0 2px 10px rgba(245,158,11,0.4);}',
            '.customs-filmix-item__quality.q-1440{background:linear-gradient(135deg,#c084fc 0%,#7e22ce 100%);color:#fff;box-shadow:0 2px 8px rgba(168,85,247,0.35);}',
            '.customs-filmix-item__quality.q-1080{background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);color:#fff;box-shadow:0 2px 8px rgba(37,99,235,0.35);}',
            '.customs-filmix-item__quality.q-720{background:linear-gradient(135deg,#64748b 0%,#334155 100%);color:#f1f5f9;}',
            '.customs-filmix-item__quality.q-480{background:rgba(255,255,255,0.12);color:#94a3b8;}',
            '.customs-filmix-item__divider{height:1px;background:linear-gradient(90deg,rgba(255,255,255,0.16) 0%,rgba(255,255,255,0.03) 100%);margin:.6em 0 .55em 0;}',
            '.customs-filmix-item__footer{display:flex;align-items:center;justify-content:space-between;gap:.5em;font-size:.82em;}',
            '.customs-filmix-item__size-box{display:flex;align-items:center;gap:.4em;color:#34d399;font-weight:700;}',
            '.customs-filmix-item__icon{width:1.1em;height:1.1em;flex-shrink:0;}',
            '.customs-filmix-item__action{display:flex;align-items:center;gap:.3em;color:rgba(255,255,255,0.65);font-weight:600;font-size:.9em;transition:color .2s ease;}',
            '.customs-filmix-item.focus .customs-filmix-item__action{color:#fbbf24;}',
            '.customs-filmix-item__play-icon{width:.9em;height:.9em;fill:currentColor;flex-shrink:0;}'
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
