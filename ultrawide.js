/*
 * Lampa 21:9 UltraWide Cinema Plugin (ultrawide.js)
 * 
 * 1. Cinemascope Zoom (1.33x): бездоганне заповнення екрана 21:9 для фільмів у контейнері 16:9 із чорними смугами.
 * 2. Режими пропорцій: Cinemascope (1.33x), 2:1 Univisium (1.15x), Нативний 21:9 (1:1), 16:9 Оригінал (Центр), Заповнити (Fill).
 * 3. Кнопка швидкого перемикання [ 21:9 ] у панелі плеєра Lampa з підтримкою пульта ТБ.
 * 4. Розумне автовизначення: автоматичне масштабування фільмів та центрування серіалів.
 * 5. Адаптивний інтерфейс каталогу Lampa під широкі монітори (2560/3440 px).
 * 
 * Сумісність з ES5 для Smart TV (Samsung Tizen, LG webOS, Android TV).
 */
(function () {
    'use strict';

    var PLUGIN_NAME = '21:9 UltraWide Cinema';
    var PLUGIN_VERSION = '1.0.0';
    var COMPONENT_NAME = 'lampa_ultrawide';

    var MODES = [
        { id: 'cinemascope', label: '21:9 🎬', title: '21:9 Cinemascope (Кроп смуг 1.33x)', scale: 1.33333 },
        { id: 'univisium',   label: '2:1 🔍',  title: '2:1 Univisium (Кроп 1.15x)',      scale: 1.15 },
        { id: 'native',      label: '21:9 1:1',title: '21:9 Нативний (1:1 без смуг)',    scale: 1.0 },
        { id: 'original',    label: '16:9 📺', title: '16:9 Стандарт (Центр)',           scale: 1.0 },
        { id: 'fill',        label: '21:9 ↔️', title: '21:9 Заповнити (Fill)',           scale: 1.0 }
    ];

    var currentMode = 'cinemascope';
    var checkInterval = null;

    function getSetting(name, def) {
        if (window.Lampa && Lampa.Storage && Lampa.Storage.get) {
            return Lampa.Storage.get(name, def);
        }
        return def;
    }

    function setSetting(name, val) {
        if (window.Lampa && Lampa.Storage && Lampa.Storage.set) {
            Lampa.Storage.set(name, val);
        }
    }

    function getScaleFactor() {
        var custom = parseFloat(getSetting('ultrawide_zoom_scale', '1.33333'));
        return isNaN(custom) || custom <= 1 ? 1.33333 : custom;
    }

    /* -------------------------------------------------------------
     *  Масштабування відео (HTML5 Video & Tizen AVPlay)
     * ------------------------------------------------------------- */
    function applyVideoScale(mode, silent) {
        if (!getSetting('ultrawide_enabled', true)) return;

        currentMode = mode || currentMode || 'cinemascope';
        var scale = 1.0;

        if (currentMode === 'cinemascope') {
            scale = getScaleFactor();
        } else if (currentMode === 'univisium') {
            scale = 1.15;
        }

        // 1. Стандартний HTML5 <video> елемент
        var video = document.querySelector('#player video, .player-video__video, .player-video video, video');
        if (video) {
            if (currentMode === 'cinemascope' || currentMode === 'univisium') {
                video.style.transform = 'scale(' + scale + ')';
                video.style.transformOrigin = 'center center';
                video.style.objectFit = 'contain';
            } else if (currentMode === 'fill') {
                video.style.transform = 'none';
                video.style.objectFit = 'fill';
                video.style.width = '100%';
                video.style.height = '100%';
            } else if (currentMode === 'native') {
                video.style.transform = 'none';
                video.style.objectFit = 'contain';
                video.style.width = '100%';
                video.style.height = '100%';
            } else { // original (16:9)
                video.style.transform = 'none';
                video.style.objectFit = 'contain';
            }
        }

        // 2. Tizen нативний відеоплеєр (webapis.avplay)
        if (window.webapis && webapis.avplay && typeof webapis.avplay.setDisplayRect === 'function') {
            try {
                var screenW = window.innerWidth || 2560;
                var screenH = window.innerHeight || 1080;

                if (currentMode === 'cinemascope' || currentMode === 'univisium') {
                    var virtualH = Math.round(screenH * scale);
                    var offsetY = Math.round((screenH - virtualH) / 2);
                    webapis.avplay.setDisplayRect(0, offsetY, screenW, virtualH);
                    webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                } else if (currentMode === 'original') {
                    var targetW = Math.round(screenH * (16 / 9));
                    var offsetX = Math.round((screenW - targetW) / 2);
                    webapis.avplay.setDisplayRect(offsetX, 0, targetW, screenH);
                    webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                } else {
                    webapis.avplay.setDisplayRect(0, 0, screenW, screenH);
                    webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                }
            } catch (eAvplay) {}
        }

        updateButtonUi();

        if (!silent && window.Lampa && Lampa.Noty && Lampa.Noty.show) {
            for (var i = 0; i < MODES.length; i++) {
                if (MODES[i].id === currentMode) {
                    Lampa.Noty.show(MODES[i].title);
                    break;
                }
            }
        }
    }

    function cycleMode() {
        var nextIndex = 0;
        for (var i = 0; i < MODES.length; i++) {
            if (MODES[i].id === currentMode) {
                nextIndex = (i + 1) % MODES.length;
                break;
            }
        }
        var nextMode = MODES[nextIndex].id;
        setSetting('ultrawide_last_mode', nextMode);
        applyVideoScale(nextMode, false);
    }

    function updateButtonUi() {
        var btn = document.querySelector('.player-panel__ultrawide');
        if (!btn) return;
        var label = btn.querySelector('.player-panel__ultrawide-label');
        for (var i = 0; i < MODES.length; i++) {
            if (MODES[i].id === currentMode) {
                if (label) label.textContent = MODES[i].label;
                btn.setAttribute('title', MODES[i].title);
                break;
            }
        }
    }

    /* -------------------------------------------------------------
     *  Вбудовування кнопки у панель плеєра
     * ------------------------------------------------------------- */
    function injectPlayerButton() {
        if (!getSetting('ultrawide_button', true)) return;

        // Панель кнопок плеєра справа
        var targetBox = document.querySelector('.player-panel__right .player-panel__box-buttons');
        if (!targetBox) targetBox = document.querySelector('.player-panel__right');
        if (!targetBox) return;

        if (document.querySelector('.player-panel__ultrawide')) return;

        var btn = document.createElement('div');
        btn.className = 'player-panel__ultrawide button selector';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.padding = '0 0.7em';
        btn.style.margin = '0 0.3em';
        btn.style.borderRadius = '0.4em';
        btn.style.background = 'rgba(255, 255, 255, 0.12)';
        btn.style.fontWeight = '700';
        btn.style.fontSize = '0.9em';
        btn.style.letterSpacing = '0.04em';
        btn.style.cursor = 'pointer';
        btn.style.color = '#fff';
        btn.style.transition = 'all 0.15s ease';

        var label = document.createElement('span');
        label.className = 'player-panel__ultrawide-label';
        label.textContent = '21:9 🎬';
        btn.appendChild(label);

        var tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = 'Формат 21:9 Cinemascope';
        btn.appendChild(tooltip);

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            cycleMode();
        });

        targetBox.insertBefore(btn, targetBox.firstChild);
        updateButtonUi();

        // Оновлюємо колекцію навігації для пульта
        if (window.Lampa && Lampa.Controller && Lampa.Controller.collectionAdd) {
            try {
                Lampa.Controller.collectionAdd($('.player-panel .selector'));
            } catch (eCtrl) {}
        }
    }

    /* -------------------------------------------------------------
     *  Розумне визначення (Фільм vs Серіал)
     * ------------------------------------------------------------- */
    function detectInitialMode(playData) {
        if (!getSetting('ultrawide_auto_detect', true)) {
            return getSetting('ultrawide_movie_mode', 'cinemascope');
        }

        var isSerial = false;
        if (playData) {
            if (playData.season || playData.serial) isSerial = true;
            if (playData.playlist && playData.playlist.length > 1) isSerial = true;
            if (playData.movie && (playData.movie.number_of_seasons || playData.movie.first_air_date)) isSerial = true;
        }

        if (isSerial) {
            return getSetting('ultrawide_serial_mode', 'original');
        } else {
            return getSetting('ultrawide_movie_mode', 'cinemascope');
        }
    }

    /* -------------------------------------------------------------
     *  Життєвий цикл плеєра
     * ------------------------------------------------------------- */
    function onPlayerStart(playData) {
        var startMode = detectInitialMode(playData);
        currentMode = startMode;

        setTimeout(function () {
            injectPlayerButton();
            applyVideoScale(startMode, true);
        }, 150);

        setTimeout(function () {
            injectPlayerButton();
            applyVideoScale(startMode, true);
        }, 600);

        if (!checkInterval) {
            checkInterval = setInterval(function () {
                var v = document.querySelector('#player video, .player-video__video, video');
                if (v && (currentMode === 'cinemascope' || currentMode === 'univisium')) {
                    var factor = currentMode === 'cinemascope' ? getScaleFactor() : 1.15;
                    var desired = 'scale(' + factor + ')';
                    if (v.style.transform !== desired) {
                        v.style.transform = desired;
                        v.style.transformOrigin = 'center center';
                        v.style.objectFit = 'contain';
                    }
                }
            }, 800);
        }
    }

    function onPlayerDestroy() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
        var btn = document.querySelector('.player-panel__ultrawide');
        if (btn && btn.parentNode) {
            btn.parentNode.removeChild(btn);
        }
    }

    /* -------------------------------------------------------------
     *  Адаптація інтерфейсу каталогу Lampa (CSS)
     * ------------------------------------------------------------- */
    function injectStyles() {
        if (document.getElementById('lampa-ultrawide-styles')) return;

        var style = document.createElement('style');
        style.id = 'lampa-ultrawide-styles';
        style.type = 'text/css';

        var css = [
            /* Підсвічування кнопки 21:9 у фокусі пульта */
            '.player-panel__ultrawide.focus { background: #ffd600 !important; color: #000 !important; transform: scale(1.08); box-shadow: 0 0 1em rgba(255,214,0,0.5); }',
            
            /* Субтитри: безпечне позиціонування всередині 21:9 кадру */
            '.player-subtitles, .player-video__subtitles { bottom: 3.8em !important; font-size: 1.15em !important; text-shadow: 0 2px 4px rgba(0,0,0,0.95); }',

            /* Адаптація UI каталогу під Ultrawide екрани */
            '@media (min-aspect-ratio: 2/1) {',
                /* Повне використання ширини для скролу карток */
                '.scroll__content { max-width: 100% !important; }',
                '.items-line { width: 100% !important; }',
                
                /* Картки фільмів: оптимальний розмір для 8-10 карток у рядку на 21:9 */
                '.card { width: 11.2% !important; margin-right: 1.2% !important; }',
                
                /* Широкий повнорозмірний бекдроп у картці фільму */
                '.full-start__bg { background-size: cover !important; background-position: center 25% !important; }',
                '.full-start__bg:after { background: linear-gradient(90deg, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.72) 40%, rgba(0,0,0,0.2) 75%, rgba(0,0,0,0) 100%) !important; }',
                
                /* Акуратна ширина діалогів, модалок і налаштувань (не розповзаються на 2.5 метри) */
                '.modal__content { max-width: 62em !important; }',
                '.settings { max-width: 65em !important; }',
                
                /* Панель плеєра на весь екран */
                '.player-panel { max-width: 100% !important; padding: 0 3em !important; }',
            '}'
        ].join('\n');

        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    /* -------------------------------------------------------------
     *  Налаштування Lampa (SettingsApi)
     * ------------------------------------------------------------- */
    function addSettings() {
        if (!window.Lampa || !Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: COMPONENT_NAME,
            name: '21:9 UltraWide',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="2" y2="14"/><line x1="22" y1="10" x2="22" y2="14"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'ultrawide_enabled',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Увімкнути режим 21:9 UltraWide',
                description: 'Активація масштабування кіно та інтерфейсу для 21:9 монітора'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'ultrawide_movie_mode',
                type: 'select',
                values: {
                    cinemascope: '🎬 Cinemascope (Кроп смуг 1.33x)',
                    univisium:   '🔍 2:1 Univisium (1.15x)',
                    native:      '📐 Нативний 21:9 (1:1)',
                    original:    '📺 16:9 Стандарт',
                    fill:        '↔️ Заповнити (Fill)'
                },
                default: 'cinemascope'
            },
            field: {
                name: 'Формат для фільмів за замовчуванням',
                description: 'Cinemascope автоматично прибирає чорні смуги зверху і знизу'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'ultrawide_serial_mode',
                type: 'select',
                values: {
                    original:    '📺 16:9 Стандарт (Центр)',
                    univisium:   '🔍 2:1 Univisium (1.15x)',
                    cinemascope: '🎬 Cinemascope (1.33x)',
                    fill:        '↔️ Заповнити (Fill)'
                },
                default: 'original'
            },
            field: {
                name: 'Формат для серіалів',
                description: 'Для телесеріалів 16:9 залишає чисті бічні смуги без спотворення пропорцій'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'ultrawide_auto_detect',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Розумне автовизначення (Фільм vs Серіал)',
                description: 'Автоматично вмикає Cinemascope для кіно та 16:9 для серіалів'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'ultrawide_zoom_scale',
                type: 'select',
                values: {
                    '1.30000': '1.30x (Формат 2.35:1)',
                    '1.33333': '1.33x (Формат 2.39:1 - Стандарт кіно)',
                    '1.36000': '1.36x (Формат 2.44:1)',
                    '1.40000': '1.40x (Максимальний зум)'
                },
                default: '1.33333'
            },
            field: {
                name: 'Коефіцієнт зуму Cinemascope',
                description: 'Точна підгонка масштабу під пропорцію кінематографічного релізу'
            }
        });

        Lampa.SettingsApi.addParam({
            component: COMPONENT_NAME,
            param: {
                name: 'ultrawide_button',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Швидка кнопка [ 21:9 ] у плеєрі',
                description: 'Додає кнопку перемикання формату на панель керування плеєра'
            }
        });
    }

    /* -------------------------------------------------------------
     *  Реєстрація у списку плагінів Lampa
     * ------------------------------------------------------------- */
    function registerManifest() {
        if (!window.Lampa || !Lampa.Manifest) return;

        var manifest = {
            type: 'video',
            version: PLUGIN_VERSION,
            name: PLUGIN_NAME,
            description: 'Cinemascope 21:9 зум та адаптивний UI для моніторів',
            component: COMPONENT_NAME
        };

        if (Array.isArray(Lampa.Manifest.plugins)) {
            var exists = Lampa.Manifest.plugins.some(function (p) { return p.component === COMPONENT_NAME; });
            if (!exists) Lampa.Manifest.plugins.push(manifest);
        } else if (Lampa.Manifest.plugins) {
            Lampa.Manifest.plugins[COMPONENT_NAME] = manifest;
        }

        try {
            var plugins = Lampa.Storage.get('plugins', []);
            var changed = false;
            plugins.forEach(function (p) {
                if (p && p.url && p.url.indexOf('ultrawide') !== -1) {
                    if (p.name !== PLUGIN_NAME) {
                        p.name = PLUGIN_NAME;
                        changed = true;
                    }
                }
            });
            if (changed) Lampa.Storage.set('plugins', plugins);
        } catch (eStorage) {}
    }

    /* -------------------------------------------------------------
     *  Ініціалізація
     * ------------------------------------------------------------- */
    function init() {
        injectStyles();
        addSettings();
        registerManifest();

        // Слухачі подій плеєра
        if (window.Lampa && Lampa.Player && Lampa.Player.listener) {
            Lampa.Player.listener.follow('start', onPlayerStart);
            Lampa.Player.listener.follow('ready', onPlayerStart);
            Lampa.Player.listener.follow('destroy', onPlayerDestroy);
        }

        // На випадок глобального лісенера Lampa
        if (window.Lampa && Lampa.Listener) {
            Lampa.Listener.follow('player', function (e) {
                if (e.type === 'start' || e.type === 'ready') {
                    onPlayerStart(e.data);
                } else if (e.type === 'destroy') {
                    onPlayerDestroy();
                }
            });
        }

        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('🎬 ' + PLUGIN_NAME + ' v' + PLUGIN_VERSION);
            }
        } catch (eNoty) {}
    }

    if (window.appready) {
        init();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    } else {
        setTimeout(init, 1000);
    }
})();
