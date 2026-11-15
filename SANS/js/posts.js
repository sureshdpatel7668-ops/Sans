
/* ==========================================================================
   posts.js — MongoDB integrated post system.
   Handles rendering, loading, likes, comments, sharing, deletion and composer.
   ========================================================================== */

(function () {
    'use strict';

    const { Utils, Store, UI } = window.SANS;
    const MAX_LEN = 500;

    /* ------------------------------------------------------------------
       MongoDB API
       ------------------------------------------------------------------ */

    const API_URL = '/api/posts';

    function getToken() {
        return localStorage.getItem('sans_token');
    }

    async function postApi(endpoint = '', options = {}) {
        const token = getToken();

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Server request failed.');
        }

        return data;
    }

    /* ------------------------------------------------------------------
       Convert MongoDB data to frontend format
       ------------------------------------------------------------------ */

    function syncMongoUser(userData) {
        if (!userData || typeof userData !== 'object' || !userData._id) {
            return;
        }

        const id = String(userData._id);
        const existing = Store.user(id);

        const user = {
            ...(existing || {}),
            id,
            name: userData.name || existing?.name || 'User',
            username: userData.username || existing?.username || 'user',
            avatar: userData.avatar || existing?.avatar || '',
            bio: userData.bio || existing?.bio || '',
            verified: !!userData.verified
        };

        const index = Store.db.users.findIndex(u => u.id === id);

        if (index >= 0) {
            Store.db.users[index] = {
                ...Store.db.users[index],
                ...user
            };
        } else {
            Store.db.users.push(user);
        }
    }

    function mapMongoPost(post) {
        const author = post.userId;

        if (author && typeof author === 'object') {
            syncMongoUser(author);
        }

        const authorId = author && typeof author === 'object'
            ? author._id
            : author;

        const likes = (post.likes || []).map(user => {
            return String(
                typeof user === 'object' && user
                    ? user._id
                    : user
            );
        });

        const comments = (post.comments || []).map(comment => {
            const commentUser = comment.userId;

            if (commentUser && typeof commentUser === 'object') {
                syncMongoUser(commentUser);
            }

            return {
                id: String(comment.id),
                userId: String(
                    typeof commentUser === 'object' && commentUser
                        ? commentUser._id
                        : commentUser
                ),
                text: comment.text || '',
                at: new Date(comment.at).getTime()
            };
        });

        return {
            id: String(post._id),
            userId: String(authorId),
            text: post.text || '',
            image: post.image || '',
            at: new Date(post.createdAt || post.updatedAt || Date.now()).getTime(),
            likes,
            comments
        };
    }

    function isMongoPost(id) {
        return /^[a-f\d]{24}$/i.test(String(id));
    }

    function updateLocalPost(post) {
        const index = Store.db.posts.findIndex(p => p.id === post.id);

        if (index >= 0) {
            Store.db.posts[index] = post;
        } else {
            Store.db.posts.unshift(post);
        }

        Store.save();
    }

    /* ------------------------------------------------------------------
       Posts object
       ------------------------------------------------------------------ */

    const Posts = {

        /* Load posts from MongoDB */
        async loadFromMongo() {
            try {
                const data = await postApi();

                if (!Array.isArray(data.posts)) {
                    throw new Error('Invalid posts response from server.');
                }

                // Only MongoDB posts.
                const mongoPosts = data.posts.map(mapMongoPost);

                Store.db.posts = mongoPosts;

                Store.save();

                Utils.emit('posts', { loaded: true });

                return mongoPosts;

            } catch (error) {
                console.error('MongoDB posts loading failed:', error);

                UI.toast(
                    error.message || 'Could not load posts.',
                    'error'
                );

                return [];
            }
        },

        /* ------------------------------------------------------------------
           Rendering
           ------------------------------------------------------------------ */

        likesLine(p, me) {
            if (!p.likes.length) {
                return '<span class="muted">Be the first to like this</span>';
            }

            const names = [];

            if (p.likes.includes(me.id)) {
                names.push('<b>you</b>');
            }

            const others = p.likes
                .filter(id => id !== me.id)
                .map(Store.user)
                .filter(Boolean)
                .sort((a, b) =>
                    Store.isFollowing(me.id, b.id) -
                    Store.isFollowing(me.id, a.id)
                );

            if (others[0]) {
                names.push(`<b>${Utils.esc(others[0].username)}</b>`);
            }

            const rest = p.likes.length - names.length;

            return 'Liked by ' + names.join(', ') +
                (rest > 0
                    ? ` and <b>${Utils.num(rest)} ${rest === 1 ? 'other' : 'others'}</b>`
                    : '');
        },

        commentHtml(c, p, me) {
            const u = Store.user(c.userId);

            if (!u) return '';

            const canDel = c.userId === me.id || p.userId === me.id;

            return `
                <div class="comment" data-cid="${c.id}">
                    <a href="profile.html?u=${Utils.esc(u.username)}">
                        ${UI.avatar(u, 'avatar--xs')}
                    </a>

                    <div class="comment__body">
                        <b>
                            <a href="profile.html?u=${Utils.esc(u.username)}">
                                ${Utils.esc(u.username)}
                            </a>
                        </b>

                        ${Utils.rich(c.text)}

                        <div class="comment__meta">
                            <time title="${Utils.fullDate(c.at)}">
                                ${Utils.timeAgo(c.at)}
                            </time>

                            ${canDel
                    ? `<button data-pa="del-comment" data-cid="${c.id}">Delete</button>`
                    : ''}
                        </div>
                    </div>
                </div>
            `;
        },

        card(p, { justLiked = false } = {}) {
            const me = Store.me();

            const u = Store.user(p.userId) || {
                username: 'deleted',
                name: 'Deleted user',
                avatar: ''
            };

            const liked = p.likes.includes(me.id);
            const n = p.comments.length;

            return `
                <article class="post card"
                    data-id="${p.id}"
                    aria-label="Post by ${Utils.esc(u.username)}">

                    <header class="post__head">
                        <a href="profile.html?u=${Utils.esc(u.username)}">
                            ${UI.avatar(u)}
                        </a>

                        <div class="post__who">
                            <a class="post__user"
                                href="profile.html?u=${Utils.esc(u.username)}">
                                ${Utils.esc(u.username)}
                            </a>

                            ${UI.verified(u)}

                            <time class="post__time"
                                datetime="${new Date(p.at).toISOString()}"
                                title="${Utils.fullDate(p.at)}">
                                ${Utils.timeAgo(p.at)}
                            </time>
                        </div>

                        <button class="icon-btn"
                            data-pa="menu"
                            aria-label="Post options"
                            aria-haspopup="menu">
                            <i class="fa-solid fa-ellipsis"></i>
                        </button>
                    </header>

                    ${p.text
                    ? `<div class="post__text">${Utils.rich(p.text)}</div>`
                    : ''}

                    ${p.image
                    ? `<div class="post__media">
                                <img src="${Utils.esc(p.image)}"
                                    alt="Post image by ${Utils.esc(u.username)}"
                                    loading="lazy">
                           </div>`
                    : ''}

                    <div class="post__actions">
                        <button class="act ${liked ? 'is-liked' : ''} ${justLiked ? 'just-liked' : ''}"
                            data-pa="like"
                            aria-pressed="${liked}"
                            aria-label="${liked ? 'Unlike' : 'Like'}">

                            <i class="${liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                            <span>${p.likes.length || ''}</span>
                        </button>

                        <button class="act"
                            data-pa="comment"
                            aria-label="Comments">
                            <i class="fa-regular fa-comment"></i>
                            <span>${n || ''}</span>
                        </button>

                        <button class="act"
                            data-pa="share"
                            aria-label="Share"
                            aria-haspopup="menu">
                            <i class="fa-regular fa-share-from-square"></i>
                        </button>
                    </div>

                    <div class="post__likes">
                        ${Posts.likesLine(p, me)}
                    </div>

                    <section class="comments" aria-label="Comments">

                        <div class="comments__list">
                            ${n
                    ? p.comments.map(c => Posts.commentHtml(c, p, me)).join('')
                    : '<p class="comments__empty">No comments yet. Start the conversation.</p>'}
                        </div>

                        <form class="comment-form"
                            data-post="${p.id}"
                            autocomplete="off">

                            ${UI.avatar(me, 'avatar--xs')}

                            <input class="input"
                                name="text"
                                maxlength="300"
                                placeholder="Add a comment"
                                aria-label="Add a comment">

                            <button class="btn btn--primary btn--sm"
                                type="submit">
                                Post
                            </button>
                        </form>
                    </section>
                </article>
            `;
        },

        /* Re-render every copy of a post */

        refresh(id, opts = {}) {
            const p = Store.post(id);

            Utils.qsa(`.post[data-id="${id}"]`).forEach(el => {
                if (!p) {
                    el.remove();
                    return;
                }

                const open = el.classList.contains('comments-open');
                const inp = el.querySelector('.comment-form input');

                const val = inp ? inp.value : '';
                const focused = document.activeElement === inp;

                const tmp = document.createElement('div');
                tmp.innerHTML = Posts.card(p, opts);

                const fresh = tmp.firstElementChild;

                if (open) fresh.classList.add('comments-open');

                if (el.classList.contains('is-highlight')) {
                    fresh.classList.add('is-highlight');
                }

                el.replaceWith(fresh);

                const newInput = fresh.querySelector('.comment-form input');

                if (newInput) {
                    newInput.value = val;

                    if (focused) newInput.focus();
                }

                const list = fresh.querySelector('.comments__list');

                if (list && opts.scrollComments) {
                    list.scrollTop = list.scrollHeight;
                }
            });
        },

        /* ------------------------------------------------------------------
           Like / Unlike
           ------------------------------------------------------------------ */

        async toggleLike(id) {
            const me = Store.me();
            const p = Store.post(id);

            if (!me || !p) return;

            // Demo posts use local storage.
            if (!isMongoPost(id)) {
                const i = p.likes.indexOf(me.id);

                if (i >= 0) {
                    p.likes.splice(i, 1);
                } else {
                    p.likes.push(me.id);
                }

                Store.save();

                Posts.refresh(id, {
                    justLiked: i < 0
                });

                Utils.emit('posts', { id });
                return;
            }

            try {
                await postApi(`/${id}/like`, {
                    method: 'PUT'
                });

                const result = await postApi();

                const updated = result.posts.find(
                    item => item._id === id
                );

                if (!updated) {
                    throw new Error('Post not found.');
                }

                const mapped = mapMongoPost(updated);

                updateLocalPost(mapped);

                Posts.refresh(id, {
                    justLiked: mapped.likes.includes(me.id)
                });

                Utils.emit('posts', { id });

            } catch (error) {
                console.error('Like update failed:', error);
                UI.toast(error.message || 'Could not update like.', 'error');
            }
        },

        /* ------------------------------------------------------------------
           Add comment
           ------------------------------------------------------------------ */

        async addComment(id, text) {
            const me = Store.me();
            const p = Store.post(id);

            text = text.trim();

            if (!me || !p || !text) return false;

            // Demo posts use local storage.
            if (!isMongoPost(id)) {
                p.comments.push({
                    id: Utils.uid('c'),
                    userId: me.id,
                    text,
                    at: Date.now()
                });

                Store.save();

                Posts.refresh(id, {
                    scrollComments: true
                });

                Utils.emit('posts', { id });

                return true;
            }

            try {
                await postApi(`/${id}/comments`, {
                    method: 'POST',
                    body: JSON.stringify({ text })
                });

                const result = await postApi();

                const updated = result.posts.find(
                    item => item._id === id
                );

                if (!updated) {
                    throw new Error('Updated post not found.');
                }

                const mapped = mapMongoPost(updated);

                updateLocalPost(mapped);

                Posts.refresh(id, {
                    scrollComments: true
                });

                Utils.emit('posts', { id });

                return true;

            } catch (error) {
                console.error('Comment creation failed:', error);
                UI.toast(error.message || 'Could not add comment.', 'error');
                return false;
            }
        },

        /* ------------------------------------------------------------------
           Delete comment
           ------------------------------------------------------------------ */

        async deleteComment(id, cid) {
            const p = Store.post(id);

            if (!p) return;

            // Demo posts use local storage.
            if (!isMongoPost(id)) {
                p.comments = p.comments.filter(c => c.id !== cid);

                Store.save();
                Posts.refresh(id);
                Utils.emit('posts', { id });

                return;
            }

            try {
                await postApi(`/${id}/comments/${cid}`, {
                    method: 'DELETE'
                });

                const result = await postApi();

                const updated = result.posts.find(
                    item => item._id === id
                );

                if (!updated) {
                    throw new Error('Post not found.');
                }

                const mapped = mapMongoPost(updated);

                updateLocalPost(mapped);

                Posts.refresh(id);
                Utils.emit('posts', { id });

            } catch (error) {
                console.error('Comment deletion failed:', error);
                UI.toast(error.message || 'Could not delete comment.', 'error');
            }
        },

        /* ------------------------------------------------------------------
           Delete post
           ------------------------------------------------------------------ */

        async remove(id) {
            const p = Store.post(id);
            const me = Store.me();

            if (!p || !me || p.userId !== me.id) return;

            const ok = await UI.confirm({
                title: 'Delete this post?',
                message: 'This removes the post, its likes and comments. You cannot undo this.',
                confirmText: 'Delete post'
            });

            if (!ok) return;

            try {
                if (isMongoPost(id)) {
                    await postApi(`/${id}`, {
                        method: 'DELETE'
                    });
                }

                Store.db.posts = Store.db.posts.filter(
                    item => item.id !== id
                );

                Store.db.notifications = Store.db.notifications.filter(
                    n => n.postId !== id
                );

                Store.save();

                Utils.qsa(`.post[data-id="${id}"]`).forEach(el => {
                    el.classList.add('is-removing');
                    setTimeout(() => el.remove(), 260);
                });

                Utils.qsa('.modal-backdrop .post-modal').forEach(m => {
                    m.closest('.modal-backdrop')
                        ?.querySelector('[data-close]')
                        ?.click();
                });

                UI.toast('Post deleted.', 'success');

                Utils.emit('posts', {
                    id,
                    deleted: true
                });

            } catch (error) {
                console.error('Post deletion failed:', error);
                UI.toast(error.message || 'Could not delete post.', 'error');
            }
        },

        /* ------------------------------------------------------------------
           Create post
           ------------------------------------------------------------------ */

        async create({ text = '', image = '' }) {
            const me = Store.me();

            if (!me) {
                UI.toast('Please login first.', 'error');
                return null;
            }

            text = text.trim();

            if (!text && !image) return null;

            try {
                const data = await postApi('', {
                    method: 'POST',
                    body: JSON.stringify({ text, image })
                });

                if (!data.post) {
                    throw new Error('Server did not return the created post.');
                }

                const post = mapMongoPost(data.post);

                updateLocalPost(post);

                Utils.emit('posts', {
                    id: post.id,
                    created: true
                });

                return post;

            } catch (error) {
                console.error('Post creation failed:', error);
                UI.toast(error.message || 'Could not publish post.', 'error');
                return null;
            }
        },

        postLink: (id) =>
            new URL('index.html?post=' + id, location.href).href,

        /* ------------------------------------------------------------------
           Menus
           ------------------------------------------------------------------ */

        menu(anchor, id) {
            const me = Store.me();
            const p = Store.post(id);

            if (!p || !me) return;

            const owner = Store.user(p.userId);
            const mine = p.userId === me.id;

            const items = [{
                label: 'Copy link',
                icon: 'fa-link',
                onClick: () => Utils.copy(Posts.postLink(id)).then(ok =>
                    UI.toast(
                        ok ? 'Link copied.' : 'Could not copy the link.',
                        ok ? 'success' : 'error'
                    )
                )
            }];

            if (!mine && owner) {
                const on = Store.isFollowing(me.id, owner.id);

                items.unshift({
                    label: 'View profile',
                    icon: 'fa-user',
                    href: `profile.html?u=${owner.username}`
                });

                items.push({
                    label: on
                        ? `Unfollow @${owner.username}`
                        : `Follow @${owner.username}`,

                    icon: on ? 'fa-user-minus' : 'fa-user-plus',

                    onClick: () => {
                        Store.toggleFollow(me.id, owner.id);

                        UI.toast(
                            on
                                ? `You unfollowed ${owner.username}.`
                                : `You are now following ${owner.username}.`,
                            'success'
                        );
                    }
                });
            }

            if (mine) {
                items.push('hr');

                items.push({
                    label: 'Delete post',
                    icon: 'fa-trash',
                    danger: true,
                    onClick: () => Posts.remove(id)
                });
            }

            UI.dropdown(anchor, items);
        },

        shareMenu(anchor, id) {
            const items = [
                {
                    label: 'Copy link',
                    icon: 'fa-link',
                    onClick: () => Utils.copy(Posts.postLink(id)).then(ok =>
                        UI.toast(
                            ok ? 'Link copied.' : 'Could not copy the link.',
                            ok ? 'success' : 'error'
                        )
                    )
                },
                {
                    label: 'Send in a message',
                    icon: 'fa-paper-plane',
                    onClick: () => Posts.shareToMessage(id)
                }
            ];

            if (navigator.share) {
                items.push({
                    label: 'Share via device',
                    icon: 'fa-arrow-up-from-bracket',
                    onClick: () => navigator.share({
                        title: 'SANS',
                        url: Posts.postLink(id)
                    }).catch(() => { })
                });
            }

            UI.dropdown(anchor, items);
        },

        shareToMessage(id) {
            const me = Store.me();
            const p = Store.post(id);

            if (!me || !p) return;

            const owner = Store.user(p.userId);

            const people = Store.users
                .filter(u => u.id !== me.id)
                .sort((a, b) =>
                    Store.isFollowing(me.id, b.id) -
                    Store.isFollowing(me.id, a.id)
                );

            const m = UI.modal({
                title: 'Send in a message',
                size: 'sm',
                html: `
                    <div class="search" style="margin-bottom:10px">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input class="input"
                            placeholder="Search people"
                            aria-label="Search people">
                    </div>

                    <div class="list-scroll" id="shareList"></div>
                `
            });

            const list = m.el.querySelector('#shareList');
            const input = m.el.querySelector('input');

            const sent = new Set();

            const draw = () => {
                const q = input.value.trim().toLowerCase();

                const rows = people.filter(u =>
                    !q ||
                    u.username.toLowerCase().includes(q) ||
                    u.name.toLowerCase().includes(q)
                );

                list.innerHTML = rows.length
                    ? rows.map(u => `
                        <div class="user-row">
                            ${UI.avatar(u)}

                            <div class="user-row__meta">
                                <span class="user-row__name">
                                    ${Utils.esc(u.username)}
                                </span>

                                <span class="user-row__sub">
                                    ${Utils.esc(u.name)}
                                </span>
                            </div>

                            <button class="btn btn--sm ${sent.has(u.id) ? 'btn--ghost' : 'btn--primary'}"
                                data-send="${u.id}"
                                ${sent.has(u.id) ? 'disabled' : ''}>
                                ${sent.has(u.id) ? 'Sent' : 'Send'}
                            </button>
                        </div>
                    `).join('')
                    : UI.empty('fa-user-slash', 'No one found', 'Try a different name.');
            };

            draw();

            input.addEventListener('input', draw);

            list.addEventListener('click', e => {
                const b = e.target.closest('[data-send]');

                if (!b) return;

                const uid = b.dataset.send;
                const c = Store.getOrCreateConv(me.id, uid);

                Store.sendMessage(
                    c.id,
                    me.id,
                    `Check out this post by @${owner?.username || 'user'}: ${Posts.postLink(id)}`
                );

                Store.schedule({
                    type: 'reply',
                    forUser: me.id,
                    convId: c.id,
                    from: uid,
                    delay: Utils.rand(3000, 6000)
                });

                Store.save();

                sent.add(uid);
                draw();

                UI.toast(`Sent to ${Store.user(uid).username}.`, 'success');
            });
        },

        /* ------------------------------------------------------------------
           Post viewer modal
           ------------------------------------------------------------------ */

        openPost(id, { comments = false } = {}) {
            const p = Store.post(id);

            if (!p) {
                return UI.toast('That post is no longer available.', 'error');
            }

            const m = UI.modal({
                bare: true,
                size: '',
                title: 'Post',
                html: `<div class="post-modal">${Posts.card(p)}</div>`
            });

            m.el.querySelector('.modal').insertAdjacentHTML(
                'afterbegin',
                `
                    <button class="icon-btn"
                        data-close
                        aria-label="Close"
                        style="position:absolute;right:8px;top:8px;z-index:2;background:rgba(0,0,0,.55);color:#fff">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                `
            );

            m.el.querySelector('.modal').style.position = 'relative';

            if (comments) {
                m.el.querySelector('.post')?.classList.add('comments-open');
            }

            return m;
        },

        /* ------------------------------------------------------------------
           Composer
           ------------------------------------------------------------------ */

        openComposer() {
            const me = Store.me();

            if (!me) {
                UI.toast('Please login first.', 'error');
                return;
            }

            let image = '';

            const m = UI.modal({
                title: 'Create post',

                html: `
                    <form class="composer" autocomplete="off">

                        <div class="composer__top">
                            ${UI.avatar(me)}

                            <textarea class="textarea"
                                name="text"
                                maxlength="${MAX_LEN + 50}"
                                placeholder="What is on your mind, ${Utils.esc(me.name.split(' ')[0])}?"
                                aria-label="Post text"></textarea>
                        </div>

                        <div class="composer__counter" id="cCount">
                            0 / ${MAX_LEN}
                        </div>

                        <div class="composer__preview hidden" id="cPrev">
                            <img alt="Preview">

                            <button type="button"
                                class="icon-btn"
                                id="cClear"
                                aria-label="Remove image">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <div class="field hidden" id="cUrlWrap" style="margin:0">
                            <input class="input"
                                name="url"
                                placeholder="https://example.com/photo.jpg"
                                aria-label="Image URL">

                            <div class="field__error"></div>
                        </div>

                        <div class="composer__tools">

                            <button type="button"
                                class="btn btn--ghost btn--sm"
                                id="cUpload">
                                <i class="fa-regular fa-image"></i>
                                Upload photo
                            </button>

                            <button type="button"
                                class="btn btn--ghost btn--sm"
                                id="cUrl">
                                <i class="fa-solid fa-link"></i>
                                Image URL
                            </button>

                            <input type="file"
                                accept="image/*"
                                id="cFile"
                                class="hidden">

                            <span style="flex:1"></span>

                            <button type="submit"
                                class="btn btn--primary"
                                id="cPost"
                                disabled>
                                Post
                            </button>
                        </div>
                    </form>
                `
            });

            const $ = s => m.el.querySelector(s);

            const form = $('form');
            const ta = form.text;
            const count = $('#cCount');
            const post = $('#cPost');

            const sync = () => {
                const n = ta.value.trim().length;

                count.textContent = `${ta.value.length} / ${MAX_LEN}`;

                count.classList.toggle(
                    'is-over',
                    ta.value.length > MAX_LEN
                );

                post.disabled = !(n || image) || ta.value.length > MAX_LEN;
            };

            const setImage = src => {
                image = src;

                $('#cPrev').classList.toggle('hidden', !src);

                if (src) {
                    $('#cPrev img').src = src;
                }

                sync();
            };

            ta.addEventListener('input', sync);

            $('#cUpload').onclick = () => $('#cFile').click();

            $('#cFile').onchange = async e => {
                const f = e.target.files[0];

                if (!f) return;

                try {
                    setImage(await Utils.readImage(f, 1000));

                    $('#cUrlWrap').classList.add('hidden');
                    form.url.value = '';

                } catch (error) {
                    UI.toast(error.message, 'error');
                }

                e.target.value = '';
            };

            $('#cUrl').onclick = () => {
                $('#cUrlWrap').classList.toggle('hidden');
                form.url.focus();
            };

            $('#cClear').onclick = () => {
                setImage('');
                form.url.value = '';
            };

            form.url.addEventListener('change', () => {
                const v = form.url.value.trim();
                const err = $('#cUrlWrap .field__error');

                err.textContent = '';

                if (!v) {
                    setImage('');
                    return;
                }

                if (!/^https?:\/\//i.test(v)) {
                    err.textContent = 'Enter a link starting with http:// or https://';
                    setImage('');
                    return;
                }

                const t = new Image();

                t.onload = () => setImage(v);

                t.onerror = () => {
                    err.textContent = 'That link did not load as an image.';
                    setImage('');
                };

                t.src = v;
            });

            form.addEventListener('submit', async e => {
                e.preventDefault();

                if (post.disabled) return;

                post.disabled = true;

                const p = await Posts.create({
                    text: ta.value,
                    image
                });

                if (!p) {
                    sync();
                    return;
                }

                m.close();

                UI.toast(
                    'Post published.',
                    'success',
                    document.body.dataset.page === 'feed'
                        ? {}
                        : {
                            href: 'index.html?post=' + p.id,
                            linkText: 'View'
                        }
                );
            });

            return m;
        }
    };

    /* ------------------------------------------------------------------
       Expose Posts globally
       ------------------------------------------------------------------ */

    window.SANS.Posts = Posts;

    /* ------------------------------------------------------------------
       Delegated click events
       ------------------------------------------------------------------ */

    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-pa]');

        if (!btn) return;

        const post = btn.closest('.post');

        if (!post) return;

        const id = post.dataset.id;

        switch (btn.dataset.pa) {
            case 'like':
                Posts.toggleLike(id);
                break;

            case 'comment':
                post.classList.toggle('comments-open');

                if (post.classList.contains('comments-open')) {
                    post.querySelector('.comment-form input')?.focus();
                }
                break;

            case 'share':
                Posts.shareMenu(btn, id);
                break;

            case 'menu':
                Posts.menu(btn, id);
                break;

            case 'del-comment':
                Posts.deleteComment(id, btn.dataset.cid);
                break;
        }
    });

    /* ------------------------------------------------------------------
       Comment form submit
       ------------------------------------------------------------------ */

    document.addEventListener('submit', async e => {
        const f = e.target.closest('.comment-form');

        if (!f) return;

        e.preventDefault();

        const text = f.elements.text.value;

        if (!text.trim()) {
            f.elements.text.focus();
            return;
        }

        const submitButton = f.querySelector('button[type="submit"]');

        submitButton.disabled = true;

        const success = await Posts.addComment(
            f.dataset.post,
            text
        );

        if (success) {
            f.elements.text.value = '';
        }

        submitButton.disabled = false;
    });

    /* ------------------------------------------------------------------
       Double-click image to like
       ------------------------------------------------------------------ */

    document.addEventListener('dblclick', e => {
        const media = e.target.closest('.post__media');

        if (!media) return;

        const post = media.closest('.post');
        const p = Store.post(post.dataset.id);
        const me = Store.me();

        if (p && me && !p.likes.includes(me.id)) {
            Posts.toggleLike(p.id);
        }
    });

})();
