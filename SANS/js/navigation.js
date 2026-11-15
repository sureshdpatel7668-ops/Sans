
/* ==========================================================================
   navigation.js — desktop sidebar, mobile navigation, MongoDB unread
   message badges, notification badges and page transitions.
   ========================================================================== */

(function () {
    'use strict';

    const { Utils, Store, UI, Theme } = window.SANS;

    const ITEMS = [
        { page: 'feed', href: 'index.html', icon: 'fa-house', label: 'Home' },
        { page: 'explore', href: 'explore.html', icon: 'fa-compass', label: 'Explore' },
        { page: 'notifications', href: 'notifications.html', icon: 'fa-bell', label: 'Notifications', badge: 'notifs' },
        { page: 'messages', href: 'messages.html', icon: 'fa-paper-plane', label: 'Messages', badge: 'msgs' },
        { page: 'create', icon: 'fa-plus', label: 'Create Post', action: 'create' },
        { page: 'profile', href: 'profile.html', icon: 'fa-user', label: 'Profile', own: true },
        { page: 'settings', href: 'settings.html', icon: 'fa-gear', label: 'Settings' }
    ];

    let badgeTimer = null;

    const badge = (key) =>
        `<span class="badge hidden" data-badge="${key}"></span>`;

    function profileHref() {
        return 'profile.html';
    }

    function getToken() {
        return localStorage.getItem('sans_token');
    }

    // GET unread message count from MongoDB
    async function getUnreadMessages() {
        const token = getToken();

        if (!token) return 0;

        try {
            const response = await fetch('/api/messages', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Unable to load unread messages');
            }

            const data = await response.json();

            if (!data.success) return null;

            const conversations = data.conversations || [];

            return conversations.reduce((total, conversation) => {
                return total + Number(conversation.unreadCount || 0);
            }, 0);

        } catch (error) {
            console.error('Navbar message badge error:', error);
            return null;
        }
    }

    // GET unread notification count from MongoDB
    async function getUnreadNotifications() {
        const token = getToken();

        if (!token) return 0;

        try {
            const response = await fetch('/api/notifications', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Unable to load unread notifications');
            }

            const data = await response.json();

            if (!data.success) return null;

            return Number(data.unreadCount || 0);

        } catch (error) {
            console.error('Navbar notification badge error:', error);
            return null;
        }
    }

    const Nav = {

        render() {
            const me = Store.me();
            const page = document.body.dataset.page;

            if (!me) return;

            const isActive = (item) =>
                item.page === page &&
                !(page === 'profile' &&
                    Utils.param('u') &&
                    Utils.param('u') !== me.username);

            // Desktop / tablet sidebar
            const side = Utils.qs('#sidebar');

            if (side) {
                side.innerHTML = `
                    <a class="brand" href="index.html" aria-label="SANS home">
                        <img src="assets/logo.svg" alt="">
                        <span>SANS</span>
                    </a>

                    <nav aria-label="Main" style="display:contents">
                        ${ITEMS.map(item => item.action
                            ? `
                                <button
                                    class="nav-link nav-link--create"
                                    data-nav-create
                                    aria-label="Create post"
                                >
                                    <i class="fa-solid ${item.icon}"></i>
                                    <span>${item.label}</span>
                                </button>
                            `
                            : `
                                <a
                                    class="nav-link ${isActive(item) ? 'is-active' : ''}"
                                    href="${item.own ? profileHref() : item.href}"
                                    ${isActive(item) ? 'aria-current="page"' : ''}
                                    aria-label="${item.label}"
                                >
                                    <i class="fa-solid ${item.icon}"></i>
                                    <span>${item.label}</span>
                                    ${item.badge ? badge(item.badge) : ''}
                                </a>
                            `
                        ).join('')}
                    </nav>

                    <div class="nav-spacer"></div>

                    <button class="nav-link" data-nav-logout aria-label="Log out">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        <span>Logout</span>
                    </button>

                    <a class="nav-user" href="profile.html" aria-label="Your profile">
                        <img class="avatar" src="${Utils.esc(me.avatar)}" alt="">
                        <div class="nav-user__meta">
                            <b>${Utils.esc(me.name)}</b>
                            <span>@${Utils.esc(me.username)}</span>
                        </div>
                    </a>
                `;
            }

            // Mobile top bar
            const top = Utils.qs('#topbar');

            if (top) {
                top.innerHTML = `
                    <a class="brand" href="index.html" aria-label="SANS home">
                        <img src="assets/logo.svg" alt="">
                        <span>SANS</span>
                    </a>

                    <div class="topbar__actions">
                        <a
                            class="icon-btn"
                            href="notifications.html"
                            aria-label="Notifications"
                        >
                            <i class="fa-regular fa-bell"></i>
                            ${badge('notifs')}
                        </a>

                        <button
                            class="icon-btn"
                            data-nav-more
                            aria-label="More options"
                        >
                            <i class="fa-solid fa-ellipsis"></i>
                        </button>
                    </div>
                `;
            }

            // Mobile bottom nav
            const bottom = Utils.qs('#bottomNav');

            if (bottom) {
                const item = (page2, href, icon, label, extra = '') => `
                    <a
                        href="${href}"
                        class="${isActive({ page: page2 }) ? 'is-active' : ''}"
                        aria-label="${label}"
                    >
                        <i class="fa-solid ${icon}"></i>
                        ${extra}
                    </a>
                `;

                bottom.setAttribute('aria-label', 'Primary');

                bottom.innerHTML =
                    item('feed', 'index.html', 'fa-house', 'Home') +
                    item('explore', 'explore.html', 'fa-compass', 'Explore') +
                    `
                        <button class="create" data-nav-create aria-label="Create post">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    ` +
                    item('messages', 'messages.html', 'fa-paper-plane', 'Messages', badge('msgs')) +
                    item('profile', 'profile.html', 'fa-user', 'Profile');
            }

            Nav.bind();
            Nav.updateBadges();
            Nav.startBadgePolling();
        },

        // Update both notification and message badges
        async updateBadges() {
            const me = Store.me();

            if (!me) return;

            let notificationCount = Number(
                Store.unreadNotifs(me.id) || 0
            );

            let messageCount = Number(
                Store.unreadMessages(me.id) || 0
            );

            const [
                mongoNotificationCount,
                mongoMessageCount
            ] = await Promise.all([
                getUnreadNotifications(),
                getUnreadMessages()
            ]);

            if (mongoNotificationCount !== null) {
                notificationCount = mongoNotificationCount;
            }

            if (mongoMessageCount !== null) {
                messageCount = mongoMessageCount;
            }

            const values = {
                notifs: notificationCount,
                msgs: messageCount
            };

            // Update all navbar badges
            Utils.qsa('[data-badge]').forEach(element => {
                const count = values[element.dataset.badge] || 0;

                element.textContent = count > 99 ? '99+' : count;
                element.classList.toggle('hidden', !count);
            });

            // Update browser tab title
            const base = {
                feed: 'Home',
                explore: 'Explore',
                notifications: 'Notifications',
                messages: 'Messages',
                profile: 'Profile',
                settings: 'Settings'
            }[document.body.dataset.page] || 'SANS';

            const total = values.notifs + values.msgs;

            document.title =
                `${total ? '(' + total + ') ' : ''}${base} • SANS`;
        },

        // Refresh badges every 3 seconds
        startBadgePolling() {
            if (badgeTimer) {
                clearInterval(badgeTimer);
            }

            badgeTimer = setInterval(() => {
                if (!document.hidden) {
                    Nav.updateBadges();
                }
            }, 3000);
        },

        bind() {
            if (Nav._bound) return;

            Nav._bound = true;

            document.addEventListener('click', (event) => {

                if (event.target.closest('[data-nav-create]')) {
                    return window.SANS.Posts.openComposer();
                }

                if (event.target.closest('[data-nav-logout]')) {
                    return window.SANS.Auth.logout();
                }

                const more = event.target.closest('[data-nav-more]');

                if (more) {
                    const dark = Theme.get() === 'dark';

                    UI.dropdown(more, [
                        {
                            label: 'Messages',
                            icon: 'fa-paper-plane',
                            href: 'messages.html'
                        },
                        {
                            label: 'Settings',
                            icon: 'fa-gear',
                            href: 'settings.html'
                        },
                        {
                            label: dark ? 'Light theme' : 'Dark theme',
                            icon: dark ? 'fa-sun' : 'fa-moon',
                            onClick: () => Theme.set(
                                dark ? 'light' : 'dark'
                            )
                        },
                        'hr',
                        {
                            label: 'Log out',
                            icon: 'fa-right-from-bracket',
                            danger: true,
                            onClick: () => window.SANS.Auth.logout()
                        }
                    ]);

                    return;
                }

                // Smooth internal page transitions
                const link = event.target.closest('a[href]');

                if (
                    link &&
                    !event.defaultPrevented &&
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !link.target
                ) {
                    const href = link.getAttribute('href');

                    if (
                        /^[\w./-]+\.html(\?.*)?(#.*)?$/.test(href) &&
                        !/^https?:/.test(href)
                    ) {
                        event.preventDefault();

                        const current =
                            location.pathname.split('/').pop() +
                            location.search;

                        if (href === current) return;

                        document.body.classList.add('is-leaving');

                        setTimeout(() => {
                            location.href = href;
                        }, 170);
                    }
                }
            });

            document.addEventListener('sans:data', () => {
                Nav.updateBadges();
            });

            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    Nav.updateBadges();
                }
            });

            window.addEventListener('beforeunload', () => {
                if (badgeTimer) {
                    clearInterval(badgeTimer);
                    badgeTimer = null;
                }
            });
        }
    };

    window.SANS.Nav = Nav;

})();
