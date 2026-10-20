/*
 * Трейлери для Lampa: українською, а за вибором у налаштуваннях — ще російською й англійською.
 * На сторінці фільму / серіалу між верхнім блоком (постер, кнопки) і «Подробно» додає горизонтальну
 * стрічку трейлерів. Спершу TMDB; лише якщо там немає нічого жодною з вибраних мов — пошук на YouTube
 * (потрібен ключ YouTube Data API в налаштуваннях плагіна). На картці — мова й джерело.
 * Синтаксис ES5 — для старих ТВ-приставок і WebView.
 */
(function () {
    'use strict';

    if (window.ua_trailers_plugin) return;
    window.ua_trailers_plugin = true;

    var ROW_NAME = 'ua_trailers';
    var CACHE_KEY = 'ua_trailers_cache_v3'; // v3: суворіший збіг назви — старі хибні результати не беремо
    var CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // результати пошуку YouTube — тиждень (квота API: ~100 пошуків на добу)
    var CACHE_LIMIT = 300;

    var CYRILLIC = /[а-яёіїєґ]/i;
    // Літери, яких немає в російській, — надійна ознака української назви відео
    var UA_LETTERS = /[іїєґ]/i;
    var UA_WORDS = /укр|україн|\bua\b/i;

    function isUkrainian(title) {
        return UA_LETTERS.test(title) || UA_WORDS.test(title);
    }

    // Порядок у стрічці: українська → російська → англійська
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

    // ---------- Налаштування ----------

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
            component: ROW_NAME,
            name: 'Стрічка трейлерів',
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="2" y="5" width="20" height="14" rx="3" stroke="currentColor" stroke-width="2"/>' +
                '<path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: ROW_NAME,
            param: { name: 'ua_trailers_title_langs', type: 'title' },
            field: { name: 'Мови трейлерів' }
        });

        LANG_ORDER.forEach(function (lang) {
            Lampa.SettingsApi.addParam({
                component: ROW_NAME,
                param: { name: 'ua_trailers_lang_' + lang, type: 'trigger', default: LANGS[lang].defaultOn },
                field: { name: LANGS[lang].name }
            });
        });

        Lampa.SettingsApi.addParam({
            component: ROW_NAME,
            param: { name: 'ua_trailers_title_youtube', type: 'title' },
            field: { name: 'YouTube' }
        });

        Lampa.SettingsApi.addParam({
            component: ROW_NAME,
            param: { name: 'ua_trailers_youtube', type: 'trigger', default: true },
            field: { name: 'Шукати на YouTube', description: 'Якщо в TMDB немає трейлера потрібною мовою' }
        });

        Lampa.SettingsApi.addParam({
            component: ROW_NAME,
            param: { name: 'ua_trailers_yt_key', type: 'input', values: '', default: '', placeholder: 'AIza…' },
            field: { name: 'Ключ YouTube Data API', description: 'console.cloud.google.com → YouTube Data API v3 → Credentials' },
            onChange: function () {
                // Новий ключ — шукаємо заново
                Lampa.Storage.set(CACHE_KEY, {});
            }
        });
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

    // ---------- Джерела ----------

    function formatDate(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    }

    // Лише трейлери й тизери (без фічуретів, кліпів, панелей Comic-Con), спершу трейлери, новіші вище
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

    // YouTube віддає назви з HTML-сутностями (&#39; тощо)
    function decodeHtml(text) {
        var t = document.createElement('textarea');
        t.innerHTML = text;
        return t.value;
    }

    // Службові й надто загальні слова — збіг по них нічого не означає («the» є майже в кожній англійській назві)
    var STOP_WORDS = {};
    ('the a an of and or in on at to for with by from part ' +
        'і й та в у на з із зі до від по за для про не що як частина ' +
        'и с со от о об что как часть ' +
        'фільм фильм movie film серіал сериал series')
        .split(' ').forEach(function (w) { STOP_WORDS[w] = true; });

    function words(text) {
        return (text || '').toLowerCase().split(/[^0-9a-zа-яіїєґё]+/i).filter(Boolean);
    }

    // Назва фільму збігається з назвою відео, якщо в ній є всі значущі слова назви
    // (для назв від 3 слів — 70 %). Слова порівнюються за основою: «проблеми» = «проблема», «Fix» ≠ «fixed».
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
            console.log('UA trailers', 'YouTube error', lang, xhr && xhr.status);
            done([], false);
        });
    }

    // Назва фільму потрібною мовою — з translations TMDB, інакше оригінальна
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

    function load(network, method, id, langs, done) {
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

            // YouTube — лише резерв: якщо TMDB знайшов хоч щось будь-якою з вибраних мов, не шукаємо
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
                    if (ok) cacheSet(cacheId, found); // помилки (квота, мережа) не кешуємо
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

    // ---------- Відтворення ----------

    function play(item, playlist) {
        if (Lampa.Platform.is('android') && Lampa.Storage.field('player_launch_trailers') == 'youtube') {
            Lampa.Android.openYoutube(item.id);
            return;
        }

        Lampa.Player.play(item);
        Lampa.Player.playlist(playlist);
    }

    // ---------- Стрічка ----------

    // Рядок сторінки фільму: той самий інтерфейс, що в рядків Lampa (create/render/toggle/destroy + події Emit)
    function createRow(list, langs) {
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
                play(playlist[i], playlist);
            });

            scroll.append(el[0]);
        });

        html.find('.items-line__body').append(scroll.render(true));

        row.create = function () {};

        row.render = function (js) {
            return js ? html[0] : html;
        };

        row.toggle = function () {
            Lampa.Controller.add(ROW_NAME, {
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

            Lampa.Controller.toggle(ROW_NAME);
        };

        row.destroy = function () {
            scroll.destroy();
            html.remove();
            row.emit('destroy');
        };

        return row;
    }

    // Вставляємо рядок другим — одразу після верхнього блоку, перед «Подробно».
    // rows і items зсуваємо разом: сторінка дозавантажує рядки за індексом items.length.
    function insertRow(link, row) {
        var first = link.items && link.items[0];
        if (!first || !link.rows) return;

        var index = 1;
        var anchor = first.render(true);

        row.use({
            onDown: link.emit.bind(link, 'down'),
            onUp: link.emit.bind(link, 'up'),
            onBack: link.emit.bind(link, 'back'),
            onLeft: link.emit.bind(link, 'left'),
            onActive: function () { link.active = link.items.indexOf(row); },
            onToggle: function () { link.scroll.update(row.render(true)); }
        });

        anchor.parentNode.insertBefore(row.render(true), anchor.nextSibling);

        link.items.splice(index, 0, row);
        link.rows.splice(index, 0, ROW_NAME);
        if (link.active >= index) link.active++;

        if (Lampa.Layer && Lampa.Layer.visible) Lampa.Layer.visible(link.scroll.render(true));
    }

    function onFull(e) {
        if (e.type !== 'complite') return;

        var movie = e.data && e.data.movie;
        var method = e.object && e.object.method;
        if (!movie || !movie.id || (method !== 'movie' && method !== 'tv')) return;

        var langs = enabledLangs();
        if (!langs.length) return;

        var page = e.body && e.body[0];
        var network = new Lampa.Reguest();

        load(network, method, movie.id, langs, function (list) {
            // Сторінку могли закрити, поки йшли запити
            if (!list.length || !page || !document.body.contains(page)) return;
            insertRow(e.link, createRow(list, langs));
        });
    }

    function addStyle() {
        var css = [
            '.ua-trailers .scroll__body{display:flex;}',
            /* Запас зверху й знизу, щоб рамку фокуса не обрізав край скролу */
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
            '.ua-trailer__meta{opacity:.6;}'
        ].join('\n');

        var style = document.createElement('style');
        style.id = 'ua-trailers-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function start() {
        addStyle();
        addSettings();
        Lampa.Listener.follow('full', onFull);
    }

    if (window.appready) start();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();
