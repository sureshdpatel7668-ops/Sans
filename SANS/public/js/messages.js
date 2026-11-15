
/* ==========================================================================
   messages.js — MongoDB direct messaging with automatic message updates.
   ========================================================================== */

(function () {
    'use strict';

    const { Utils, Store, UI } = window.SANS;

    const API = '/api/messages';
    const POLL_INTERVAL = 3000;

    let conversations = [];
    let people = [];
    let me = null;
    let active = null;
    let loading = false;
    let polling = false;
    let pollTimer = null;

    function getToken() {
        return localStorage.getItem('sans_token');
    }

    function userId(user) {
        if (!user) return '';
        return String(user._id || user.id || user);
    }

    function getHeaders() {
        const token = getToken();

        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        };
    }

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...getHeaders(),
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Something went wrong.');
        }

        return data;
    }

    function escape(value) {
        return Utils.esc(String(value || ''));
    }

    function linkify(text) {
        const safe = escape(text);

        return safe.replace(
            /(https?:\/\/[^\s<]+)/g,
            (url) => {
                const isPost = /[?&]post=/.test(
                    url.replace(/&amp;/g, '&')
                );

                const label = isPost
                    ? 'View post'
                    : url.replace(/^https?:\/\//, '').slice(0, 40);

                return `<a href="${url}" ${
                    isPost
                        ? ''
                        : 'target="_blank" rel="noopener noreferrer"'
                }>${label}</a>`;
            }
        );
    }

    function mapMessage(message) {
        const sender = message.sender;

        return {
            id: String(message._id || message.id || ''),
            from: userId(sender),
            text: message.text || '',
            at: new Date(message.createdAt || message.at || Date.now()),
            readBy: (message.readBy || []).map(userId)
        };
    }

    function mapConversation(conversation) {
        const members = (conversation.members || []).map(member => {
            if (typeof member === 'object' && member !== null) {
                return {
                    id: userId(member),
                    name: member.name || member.username || 'User',
                    username: member.username || '',
                    avatar: member.avatar || '',
                    verified: !!member.verified
                };
            }

            return String(member);
        });

        const messages = (conversation.messages || []).map(mapMessage);

        return {
            id: String(conversation._id || conversation.id),
            members,
            messages,
            unreadCount: Number(conversation.unreadCount || 0),
            updatedAt: new Date(conversation.updatedAt || Date.now())
        };
    }

    function getOther(conversation) {
        if (!conversation) return null;

        return conversation.members.find(member => {
            return userId(member) !== userId(me);
        }) || null;
    }

    function getConversation(id) {
        return conversations.find(c => c.id === String(id));
    }

    function getLastMessage(conversation) {
        const messages = conversation.messages || [];

        return messages.length
            ? messages[messages.length - 1]
            : null;
    }

    function getUnread(conversation) {
        return Number(conversation.unreadCount || 0);
    }

    function syncPeople() {
        const known = new Map();

        (Store.users || []).forEach(user => {
            known.set(userId(user), user);
        });

        conversations.forEach(conversation => {
            conversation.members.forEach(member => {
                if (typeof member === 'object') {
                    known.set(userId(member), member);
                }
            });
        });

        people.forEach(user => {
            known.set(userId(user), user);
        });

        people = Array.from(known.values()).filter(user => {
            return userId(user) !== userId(me);
        });
    }

    async function loadPeople() {
        try {
            const data = await apiRequest('/api/user/discover');

            if (Array.isArray(data.users)) {
                people = data.users.map(user => ({
                    ...user,
                    id: userId(user)
                }));
            }
        } catch (error) {
            // Existing Store users remain available as fallback.
        }

        syncPeople();
    }

    async function loadConversations() {
        const data = await apiRequest(API);

        conversations = (data.conversations || []).map(
            mapConversation
        );

        syncPeople();
    }

    async function loadConversation(id) {
        const data = await apiRequest(
            `${API}/${encodeURIComponent(id)}`
        );

        const updated = mapConversation(data.conversation);

        const index = conversations.findIndex(
            conversation => conversation.id === updated.id
        );

        if (index >= 0) {
            conversations[index] = updated;
        } else {
            conversations.unshift(updated);
        }

        syncPeople();

        return updated;
    }

    async function markRead(id) {
        try {
            await apiRequest(
                `${API}/${encodeURIComponent(id)}/read`,
                { method: 'PATCH' }
            );

            const conversation = getConversation(id);

            if (conversation) {
                conversation.unreadCount = 0;
            }
        } catch (error) {
            console.error('Unable to mark messages as read:', error);
        }
    }

    function drawList(listEl, search) {
        if (!listEl) return;

        const query = search.value.trim().toLowerCase();

        const rows = conversations
            .filter(conversation => {
                return conversation.messages.length ||
                    conversation.id === active;
            })
            .filter(conversation => {
                const other = getOther(conversation);

                if (!other) return false;

                const name = String(other.name || '').toLowerCase();
                const username = String(other.username || '').toLowerCase();

                const messageMatch = conversation.messages.some(message => {
                    return message.text.toLowerCase().includes(query);
                });

                return !query ||
                    name.includes(query) ||
                    username.includes(query) ||
                    messageMatch;
            })
            .sort((a, b) => {
                const dateA = getLastMessage(a)?.at || a.updatedAt;
                const dateB = getLastMessage(b)?.at || b.updatedAt;

                return new Date(dateB) - new Date(dateA);
            });

        listEl.innerHTML = rows.length
            ? rows.map(conversation => {
                const other = getOther(conversation);
                const last = getLastMessage(conversation);
                const unread = getUnread(conversation);

                const preview = last
                    ? (last.from === userId(me) ? 'You: ' : '') +
                      escape(last.text.replace(
                          /https?:\/\/\S+/g,
                          'a link'
                      ))
                    : 'Say hello';

                return `
                    <button
                        class="conv ${conversation.id === active ? 'is-active' : ''} ${unread ? 'is-unread' : ''}"
                        data-conv="${escape(conversation.id)}"
                    >
                        <img
                            class="avatar"
                            style="width:46px;height:46px"
                            src="${escape(other.avatar)}"
                            alt=""
                        >

                        <div class="conv__meta">
                            <div class="conv__top">
                                <span class="conv__name">
                                    ${escape(other.name)}
                                </span>

                                <span class="conv__time">
                                    ${last ? Utils.timeAgo(last.at) : ''}
                                </span>
                            </div>

                            <div class="conv__last">
                                ${preview}
                            </div>
                        </div>

                        ${unread
                            ? `<span class="badge">${unread}</span>`
                            : ''}
                    </button>
                `;
            }).join('')
            : UI.empty(
                'fa-comments',
                query ? 'No conversations found' : 'No messages yet',
                query
                    ? 'Try a different name or word.'
                    : 'Start a conversation with the new message button.'
            );
    }

    function drawChat(root, stick = true) {
        const chat = Utils.qs('#chat');

        if (!chat || !root) return;

        const conversation = active
            ? getConversation(active)
            : null;

        root.classList.toggle('has-chat', !!conversation);

        if (!conversation) {
            chat.innerHTML = `
                <div class="chat__empty">
                    ${UI.empty(
                        'fa-paper-plane',
                        'Your messages',
                        'Pick a conversation or start a new one.',
                        '<button class="btn btn--primary" data-newchat>New message</button>'
                    )}
                </div>
            `;
            return;
        }

        const other = getOther(conversation);

        if (!other) {
            chat.innerHTML = UI.empty(
                'fa-user-slash',
                'User unavailable',
                'This conversation has no other member.'
            );
            return;
        }

        const previousBody = Utils.qs('.chat__body');
        const previousScroll = previousBody
            ? previousBody.scrollTop
            : 0;

        const previousInput = Utils.qs('#chatInput');
        const hadFocus = previousInput &&
            document.activeElement === previousInput;

        const draft = previousInput ? previousInput.value : '';

        const selectionStart = previousInput
            ? previousInput.selectionStart
            : 0;

        const selectionEnd = previousInput
            ? previousInput.selectionEnd
            : 0;

        let day = '';
        let body = '';

        conversation.messages.forEach(message => {
            const dateLabel = Utils.dayLabel(message.at);

            if (dateLabel !== day) {
                day = dateLabel;
                body += `
                    <div class="chat__day">
                        ${escape(dateLabel)}
                    </div>
                `;
            }

            body += `
                <div class="msg ${
                    message.from === userId(me)
                        ? 'msg--out'
                        : 'msg--in'
                }">
                    ${linkify(message.text)}

                    <span class="msg__time">
                        ${Utils.clock(message.at)}
                    </span>
                </div>
            `;
        });

        if (!conversation.messages.length) {
            body = `
                <div class="chat__empty">
                    ${UI.empty(
                        'fa-hand',
                        `Say hi to ${(other.name || 'User').split(' ')[0]}`,
                        'Messages you send show up here.'
                    )}
                </div>
            `;
        }

        chat.innerHTML = `
            <div class="chat__head">
                <button
                    class="icon-btn chat__back"
                    data-back
                    aria-label="Back to conversations"
                >
                    <i class="fa-solid fa-arrow-left"></i>
                </button>

                <a href="profile.html?u=${encodeURIComponent(other.username || '')}">
                    ${UI.avatar(other)}

                    <div style="min-width:0">
                        <b>
                            ${escape(other.name)}
                            ${UI.verified(other)}
                        </b>

                        <div class="muted" style="font-size:13px">
                            @${escape(other.username)}
                        </div>
                    </div>
                </a>

                <a
                    class="btn btn--ghost btn--sm"
                    href="profile.html?u=${encodeURIComponent(other.username || '')}"
                >
                    View profile
                </a>
            </div>

            <div class="chat__body" id="chatBody">
                ${body}
            </div>

            <form class="chat__form" id="chatForm" autocomplete="off">
                <input
                    class="input"
                    id="chatInput"
                    placeholder="Message ${escape((other.name || 'User').split(' ')[0])}"
                    maxlength="2000"
                    aria-label="Message"
                    required
                >

                <button
                    class="btn btn--primary"
                    type="submit"
                    aria-label="Send"
                >
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        `;

        const bodyElement = Utils.qs('#chatBody');

        bodyElement.scrollTop = stick
            ? bodyElement.scrollHeight
            : previousScroll;

        const input = Utils.qs('#chatInput');

        input.value = draft;

        if (hadFocus) {
            input.focus({ preventScroll: true });
            input.setSelectionRange(selectionStart, selectionEnd);
        }
    }

    // Automatically check for new messages every 3 seconds.
    async function refreshMessages(root, listEl, search) {
        if (polling || document.hidden || !getToken()) return;

        polling = true;

        try {
            const previousConversation = active
                ? getConversation(active)
                : null;

            const previousMessages = previousConversation
                ? previousConversation.messages.map(message => message.id).join(',')
                : '';

            await loadConversations();

            let newMessages = false;

            if (active) {
                const updated = await loadConversation(active);

                const updatedMessages = updated.messages
                    .map(message => message.id)
                    .join(',');

                newMessages = previousMessages !== updatedMessages;

                if (newMessages) {
                    const body = Utils.qs('#chatBody');

                    const nearBottom = body
                        ? body.scrollHeight - body.scrollTop - body.clientHeight < 100
                        : true;

                    await markRead(active);

                    drawChat(root, nearBottom);

                    if (window.SANS.Nav) {
                        window.SANS.Nav.updateBadges();
                    }
                }
            }

            drawList(listEl, search);

        } catch (error) {
            console.error('Automatic message refresh failed:', error);
        } finally {
            polling = false;
        }
    }

    async function openConversation(id, root, listEl, search) {
        active = String(id);

        const conversation = getConversation(active);

        if (!conversation) return;

        history.replaceState(
            null,
            '',
            'messages.html?c=' + encodeURIComponent(active)
        );

        drawList(listEl, search);
        drawChat(root);

        await markRead(active);

        try {
            await loadConversation(active);
        } catch (error) {
            console.error('Unable to refresh conversation:', error);
        }

        if (active === String(id)) {
            drawList(listEl, search);
            drawChat(root, false);
        }

        if (window.SANS.Nav) {
            window.SANS.Nav.updateBadges();
        }
    }

    async function sendMessage(text, root, listEl, search) {
        text = text.trim();

        if (!text || !active || loading) return;

        const conversation = getConversation(active);

        if (!conversation) return;

        loading = true;

        const input = Utils.qs('#chatInput');

        if (input) input.disabled = true;

        try {
            const data = await apiRequest(
                `${API}/${encodeURIComponent(active)}`,
                {
                    method: 'POST',
                    body: JSON.stringify({ text })
                }
            );

            const message = mapMessage(data.message);

            conversation.messages.push(message);
            conversation.updatedAt = message.at;

            drawList(listEl, search);
            drawChat(root);
        } catch (error) {
            UI.toast(error.message, 'error');

            if (input) {
                input.value = text;
            }
        } finally {
            loading = false;

            const currentInput = Utils.qs('#chatInput');

            if (currentInput) {
                currentInput.disabled = false;
                currentInput.focus();
            }
        }
    }

    async function newChat(root, listEl, search) {
        await loadPeople();

        const availablePeople = people.filter(person => {
            return userId(person) !== userId(me);
        });

        const modal = UI.modal({
            title: 'New message',
            size: 'sm',
            html: `
                <div class="search" style="margin-bottom:10px">
                    <i class="fa-solid fa-magnifying-glass"></i>

                    <input
                        class="input"
                        placeholder="Search people"
                        aria-label="Search people"
                    >
                </div>

                <div class="list-scroll" id="npList"></div>
            `
        });

        const list = modal.el.querySelector('#npList');
        const input = modal.el.querySelector('input');

        const draw = () => {
            const query = input.value.trim().toLowerCase();

            const rows = availablePeople
                .filter(person => {
                    return !query ||
                        String(person.username || '').toLowerCase().includes(query) ||
                        String(person.name || '').toLowerCase().includes(query);
                });

            list.innerHTML = rows.length
                ? rows.map(person => `
                    <button
                        class="conv"
                        style="padding:8px 4px"
                        data-user="${escape(userId(person))}"
                    >
                        ${UI.avatar(person)}

                        <div class="conv__meta">
                            <span class="conv__name">
                                ${escape(person.name)}
                            </span>

                            <div class="conv__last">
                                @${escape(person.username)}
                            </div>
                        </div>
                    </button>
                `).join('')
                : UI.empty(
                    'fa-user-slash',
                    'No one found',
                    'Try a different name.'
                );
        };

        draw();

        input.addEventListener('input', draw);

        list.addEventListener('click', async event => {
            const button = event.target.closest('[data-user]');

            if (!button) return;

            const targetId = button.dataset.user;

            if (!/^[a-f\d]{24}$/i.test(targetId)) {
                UI.toast(
                    'This account is not available in MongoDB yet.',
                    'error'
                );
                return;
            }

            button.disabled = true;

            try {
                const data = await apiRequest(API, {
                    method: 'POST',
                    body: JSON.stringify({ userId: targetId })
                });

                const conversation = mapConversation(data.conversation);

                const existingIndex = conversations.findIndex(
                    item => item.id === conversation.id
                );

                if (existingIndex >= 0) {
                    conversations[existingIndex] = conversation;
                } else {
                    conversations.unshift(conversation);
                }

                syncPeople();

                modal.close();

                await openConversation(
                    conversation.id,
                    root,
                    listEl,
                    search
                );
            } catch (error) {
                UI.toast(error.message, 'error');
                button.disabled = false;
            }
        });
    }

    window.SANS.pages.messages = {
        active: null,

        async init() {
            const self = this;

            me = Store.me();

            const root = Utils.qs('#messages');
            const listEl = Utils.qs('#convItems');
            const search = Utils.qs('#convSearch');

            if (!root || !listEl || !search) return;

            if (!me) {
                UI.toast('Please login to view messages.', 'error');
                return;
            }

            if (!getToken()) {
                UI.toast('Please login again.', 'error');
                return;
            }

            listEl.innerHTML = UI.skeletonPosts(2);

            try {
                await Promise.all([
                    loadConversations(),
                    loadPeople()
                ]);
            } catch (error) {
                listEl.innerHTML = UI.empty(
                    'fa-circle-exclamation',
                    'Unable to load messages',
                    error.message
                );

                UI.toast(error.message, 'error');
                return;
            }

            const open = async id => {
                self.active = String(id);
                await openConversation(id, root, listEl, search);
            };

            root.addEventListener('click', event => {
                const conversationButton = event.target.closest('[data-conv]');

                if (conversationButton) {
                    open(conversationButton.dataset.conv);
                    return;
                }

                if (event.target.closest('[data-newchat]')) {
                    newChat(root, listEl, search);
                    return;
                }

                if (event.target.closest('[data-back]')) {
                    active = null;
                    self.active = null;

                    history.replaceState(
                        null,
                        '',
                        'messages.html'
                    );

                    drawList(listEl, search);
                    drawChat(root);
                }
            });

            root.addEventListener('submit', event => {
                if (event.target.id !== 'chatForm') return;

                event.preventDefault();

                const input = Utils.qs('#chatInput');

                if (!input) return;

                const value = input.value;

                if (!value.trim()) return;

                input.value = '';

                sendMessage(value, root, listEl, search);
            });

            search.addEventListener('input', () => {
                drawList(listEl, search);
            });

            document.addEventListener('sans:data', event => {
                if (
                    event.detail.type !== 'engine' &&
                    event.detail.type !== 'external' &&
                    event.detail.type !== 'follow'
                ) {
                    return;
                }

                drawList(listEl, search);
            });

            window.addEventListener('beforeunload', () => {
                active = null;

                if (pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
            });

            drawList(listEl, search);

            const to = Utils.param('to');
            const conversationId = Utils.param('c');

            if (to) {
                const person = people.find(user => {
                    return String(user.username).toLowerCase() ===
                        String(to).toLowerCase();
                });

                if (person && userId(person) !== userId(me)) {
                    const targetId = userId(person);

                    try {
                        const data = await apiRequest(API, {
                            method: 'POST',
                            body: JSON.stringify({ userId: targetId })
                        });

                        const conversation = mapConversation(data.conversation);

                        const existingIndex = conversations.findIndex(
                            item => item.id === conversation.id
                        );

                        if (existingIndex >= 0) {
                            conversations[existingIndex] = conversation;
                        } else {
                            conversations.unshift(conversation);
                        }

                        await open(conversation.id);
                    } catch (error) {
                        UI.toast(error.message, 'error');
                    }
                }
            }

            if (conversationId && getConversation(conversationId)) {
                await open(conversationId);
            } else if (!to) {
                active = null;
                self.active = null;

                drawChat(root);
            }

            // Start automatic updates after initial page loading.
            if (pollTimer) {
                clearInterval(pollTimer);
            }

            pollTimer = setInterval(() => {
                refreshMessages(root, listEl, search);
            }, POLL_INTERVAL);
        }
    };
})();
