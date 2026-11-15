
/* ==========================================================================
   profile.js — SANS profile page
   MongoDB API integration:
   - Load logged-in user's profile from MongoDB
   - Load MongoDB posts into profile grid
   - Update name, username, bio and avatar
   - Preserve followers, following and existing profile UI
   ========================================================================== */

(function () {
    'use strict';

    const { Utils, Store, UI, Posts } = window.SANS;

    const API = '/api/user';

    // --------------------------------------------------
    // API HELPERS
    // --------------------------------------------------

    function getToken() {
        return localStorage.getItem('sans_token');
    }

    async function apiRequest(endpoint, options = {}) {
        const token = getToken();

        const response = await fetch(`${API}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({
            success: false,
            message: 'Invalid server response.'
        }));

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Something went wrong.');
        }

        return data;
    }

    // --------------------------------------------------
    // SYNC MONGODB USER WITH LOCAL STORE
    // --------------------------------------------------

    function syncUser(apiUser) {
        if (!apiUser) return null;

        const userId = String(apiUser.id || apiUser._id || '');

        if (!userId) {
            throw new Error('User ID missing from server response.');
        }

        const users = Store.db.users || [];

        let user = users.find(u =>
            String(u.id) === userId ||
            String(u._id) === userId
        );

        if (!user) {
            user = { id: userId };
            users.push(user);
        }

        user.id = userId;
        user._id = userId;
        user.name = apiUser.name || user.name || '';
        user.username = apiUser.username || user.username || '';
        user.avatar = apiUser.avatar || '';
        user.bio = apiUser.bio || '';
        user.verified = !!apiUser.verified;

        if (Array.isArray(apiUser.following)) {
            user.following = apiUser.following.map(item =>
                String(item._id || item.id || item)
            );
        }

        if (Array.isArray(apiUser.followers)) {
            user.followers = apiUser.followers.map(item =>
                String(item._id || item.id || item)
            );
        }

        if (apiUser.settings) {
            user.settings = apiUser.settings;
        }

        Store.db.users = users;
        Store.save();

        return user;
    }

    // --------------------------------------------------
    // PROFILE TARGET
    // --------------------------------------------------

    function target() {
        const me = Store.me();
        const name = Utils.param('u');

        return name ? Store.userByName(name) : me;
    }

    // --------------------------------------------------
    // POSTS GRID
    // --------------------------------------------------

    function gridHtml(list) {
        return list.map(p => {
            const likes = Array.isArray(p.likes) ? p.likes : [];
            const comments = Array.isArray(p.comments) ? p.comments : [];

            return `
                <button
                    class="grid__item"
                    data-open="${Utils.esc(p.id)}"
                    aria-label="Open post"
                >
                    ${p.image
                        ? `
                            <img
                                src="${Utils.esc(p.image)}"
                                alt=""
                                loading="lazy"
                            >
                        `
                        : `
                            <div class="grid__text">
                                ${Utils.esc(p.text || '')}
                            </div>
                        `
                    }

                    <span class="grid__hover">
                        <span>
                            <i class="fa-solid fa-heart"></i>
                            ${likes.length}
                        </span>

                        <span>
                            <i class="fa-solid fa-comment"></i>
                            ${comments.length}
                        </span>
                    </span>
                </button>
            `;
        }).join('');
    }

    // --------------------------------------------------
    // FOLLOWERS / FOLLOWING MODAL
    // --------------------------------------------------

    function openList(kind, user) {
        const list = kind === 'followers'
            ? Store.followers(user.id)
            : Store.following(user.id);

        const m = UI.modal({
            title: kind === 'followers' ? 'Followers' : 'Following',
            size: 'sm',

            html: `
                <div class="list-scroll">
                    ${list.length
                        ? list.map(u => UI.userRow(u)).join('')
                        : UI.empty(
                            'fa-user-group',
                            kind === 'followers'
                                ? 'No followers yet'
                                : 'Not following anyone',
                            kind === 'followers'
                                ? 'When people follow this account, they show up here.'
                                : 'Accounts followed will show up here.'
                        )
                    }
                </div>
            `
        });

        m.el.addEventListener('click', e => {
            if (e.target.closest('a')) {
                m.close();
            }
        });
    }

    // --------------------------------------------------
    // EDIT PROFILE
    // --------------------------------------------------

    function openEdit(me, done) {
        const { AVATARS, Rules } = window.SANS.Auth;
        const { setError } = window.SANS.formUtils;

        let avatar = me.avatar || '';
        let custom = AVATARS.includes(me.avatar) ? null : me.avatar;

        const m = UI.modal({
            title: 'Edit profile',

            html: `
                <form novalidate>

                    <div class="field">
                        <label>Profile picture</label>
                        <div class="avatar-picker" id="ep"></div>

                        <input
                            type="file"
                            accept="image/*"
                            id="epFile"
                            class="hidden"
                        >
                    </div>

                    <div class="field">
                        <label for="epName">Full name</label>

                        <input
                            class="input"
                            id="epName"
                            name="name"
                            maxlength="40"
                            value="${Utils.esc(me.name || '')}"
                        >
                    </div>

                    <div class="field">
                        <label for="epUser">Username</label>

                        <input
                            class="input"
                            id="epUser"
                            name="username"
                            maxlength="20"
                            value="${Utils.esc(me.username || '')}"
                        >
                    </div>

                    <div class="field">
                        <label for="epBio">Bio</label>

                        <textarea
                            class="textarea"
                            id="epBio"
                            name="bio"
                            maxlength="160"
                            style="min-height:80px"
                        >${Utils.esc(me.bio || '')}</textarea>

                        <span class="field__hint" id="epCount"></span>
                    </div>

                    <div style="display:flex;justify-content:flex-end;gap:10px">

                        <button
                            type="button"
                            class="btn btn--ghost"
                            data-close
                        >
                            Cancel
                        </button>

                        <button
                            class="btn btn--primary"
                            type="submit"
                            id="saveProfileBtn"
                        >
                            Save changes
                        </button>

                    </div>

                </form>
            `
        });

        const f = m.el.querySelector('form');
        const pick = m.el.querySelector('#ep');
        const saveBtn = m.el.querySelector('#saveProfileBtn');

        // Draw avatar choices
        const drawAvatars = () => {
            pick.innerHTML =
                AVATARS.map(a => `
                    <button
                        type="button"
                        class="${a === avatar ? 'is-selected' : ''}"
                        data-av="${Utils.esc(a)}"
                        aria-label="Choose avatar"
                    >
                        <img src="${Utils.esc(a)}" alt="">
                    </button>
                `).join('') +

                (custom ? `
                    <button
                        type="button"
                        class="${custom === avatar ? 'is-selected' : ''}"
                        data-av="custom"
                        aria-label="Your photo"
                    >
                        <img src="${Utils.esc(custom)}" alt="">
                    </button>
                ` : '') +

                `
                    <button
                        type="button"
                        class="upload"
                        data-up
                        aria-label="Upload photo"
                    >
                        <i class="fa-solid fa-camera"></i>
                    </button>
                `;
        };

        drawAvatars();

        // Select avatar
        pick.onclick = e => {
            const b = e.target.closest('button');

            if (!b) return;

            if (b.dataset.up !== undefined) {
                m.el.querySelector('#epFile').click();
                return;
            }

            avatar = b.dataset.av === 'custom'
                ? custom
                : b.dataset.av;

            drawAvatars();
        };

        // Upload avatar
        m.el.querySelector('#epFile').onchange = async e => {
            const file = e.target.files[0];

            if (!file) return;

            try {
                custom = await Utils.readImage(file, 256);
                avatar = custom;
                drawAvatars();

            } catch (err) {
                UI.toast(err.message, 'error');

            } finally {
                e.target.value = '';
            }
        };

        // Bio character counter
        const count = () => {
            m.el.querySelector('#epCount').textContent =
                `${f.bio.value.length} / 160`;
        };

        count();
        f.bio.addEventListener('input', count);

        // Save profile to MongoDB
        f.addEventListener('submit', async e => {
            e.preventDefault();

            if (saveBtn.disabled) return;

            const name = f.name.value.trim();
            const username = f.username.value.trim().toLowerCase();
            const bio = f.bio.value.trim();

            const okN = setError(
                f.name,
                Rules.name(name)
            );

            const okU = setError(
                f.username,
                Rules.username(username, me.id)
            );

            if (!okN || !okU) return;

            if (bio.length > 160) {
                UI.toast(
                    'Bio cannot exceed 160 characters.',
                    'error'
                );
                return;
            }

            if (!getToken()) {
                UI.toast('Please login again.', 'error');
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                const data = await apiRequest('/me', {
                    method: 'PUT',

                    body: JSON.stringify({
                        name,
                        username,
                        bio,
                        avatar
                    })
                });

                const updatedUser = syncUser(data.user);

                if (!updatedUser) {
                    throw new Error('Could not update local profile.');
                }

                m.close();

                UI.toast(
                    'Profile updated successfully.',
                    'success'
                );

                if (typeof done === 'function') {
                    done(updatedUser);
                }

            } catch (err) {
                UI.toast(err.message, 'error');

                saveBtn.disabled = false;
                saveBtn.textContent = 'Save changes';
            }
        });
    }

    // Reused by Settings page
    window.SANS.profileEdit = openEdit;

    // --------------------------------------------------
    // PROFILE PAGE
    // --------------------------------------------------

    window.SANS.pages.profile = {

        async init() {
            const root = Utils.qs('#profileRoot');

            if (!root) return;

            let me = Store.me();

            // Draw profile
            const draw = () => {
                me = Store.me();

                const u = target();

                if (!u) {
                    root.innerHTML = UI.empty(
                        'fa-user-slash',
                        'Profile not found',
                        'This user does not exist or the link is wrong.',
                        '<a class="btn btn--primary" href="explore.html">Explore people</a>'
                    );

                    return;
                }

                const own = me && String(u.id) === String(me.id);

                const posts = Store.postsBy(u.id) || [];

                const following = me
                    ? Store.isFollowing(me.id, u.id)
                    : false;

                const followsMe = me
                    ? Store.isFollowing(u.id, me.id)
                    : false;

                document.title =
                    `${u.name} (@${u.username}) • SANS`;

                root.innerHTML = `
                    <section class="card profile-head">

                        <img
                            class="profile-head__avatar"
                            src="${Utils.esc(u.avatar || '')}"
                            alt="${Utils.esc(u.name || '')}"
                        >

                        <div>

                            <div class="profile-head__top">

                                <h1>
                                    ${Utils.esc(u.username || '')}
                                    ${UI.verified(u)}
                                </h1>

                                ${own
                                    ? `
                                        <button
                                            class="btn btn--ghost btn--sm"
                                            id="editBtn"
                                        >
                                            <i class="fa-solid fa-pen"></i>
                                            Edit profile
                                        </button>

                                        <a
                                            class="btn btn--ghost btn--sm"
                                            href="settings.html"
                                        >
                                            Settings
                                        </a>
                                    `
                                    : `
                                        ${UI.followBtn(u, '')}

                                        <a
                                            class="btn btn--ghost btn--sm"
                                            href="messages.html?to=${Utils.esc(u.username || '')}"
                                        >
                                            <i class="fa-regular fa-paper-plane"></i>
                                            Message
                                        </a>

                                        ${followsMe
                                            ? '<span class="follows-you">Follows you</span>'
                                            : ''
                                        }
                                    `
                                }

                            </div>

                            <div class="profile-stats">

                                <div>
                                    <b>${Utils.num(posts.length)}</b>
                                    <span>${posts.length === 1 ? 'post' : 'posts'}</span>
                                </div>

                                <button data-list="followers">
                                    <b>${Utils.num(Store.followers(u.id).length)}</b>
                                    <span>followers</span>
                                </button>

                                <button data-list="following">
                                    <b>${Utils.num(Store.following(u.id).length)}</b>
                                    <span>following</span>
                                </button>

                            </div>

                            <div class="profile-name">
                                ${Utils.esc(u.name || '')}
                            </div>

                            <div class="profile-bio">
                                ${Utils.rich(u.bio || '')}
                            </div>

                        </div>

                    </section>

                    <div class="tabs" role="tablist">

                        <button
                            class="tab is-active"
                            role="tab"
                            aria-selected="true"
                        >
                            <i class="fa-solid fa-table-cells"></i>
                            Posts
                        </button>

                    </div>

                    ${posts.length
                        ? `
                            <div class="grid" id="postGrid">
                                ${gridHtml(posts)}
                            </div>
                        `
                        : UI.empty(
                            'fa-camera',
                            own ? 'Share your first post' : 'No posts yet',
                            own
                                ? 'Photos and thoughts you post will appear on your profile.'
                                : `${u.username} has not posted yet.`,
                            own
                                ? '<button class="btn btn--primary" data-nav-create>Create post</button>'
                                : ''
                        )
                    }
                `;

                // Edit profile
                root.querySelector('#editBtn')
                    ?.addEventListener('click', () => {
                        openEdit(me, () => {
                            draw();
                            window.SANS.Nav.render();
                        });
                    });

                // Followers and following
                root.querySelectorAll('[data-list]')
                    .forEach(b => {
                        b.addEventListener('click', () => {
                            openList(b.dataset.list, u);
                        });
                    });

                // Open post
                root.querySelector('#postGrid')
                    ?.addEventListener('click', e => {
                        const b = e.target.closest('[data-open]');

                        if (b) {
                            Posts.openPost(b.dataset.open);
                        }
                    });
            };

            // Initial render
            draw();

            // Load MongoDB posts and profile
            try {
                if (typeof Posts.loadFromMongo === 'function') {
                    await Posts.loadFromMongo();
                }

                if (getToken()) {
                    const data = await apiRequest('/me');

                    syncUser(data.user);
                    me = Store.me();
                }

                draw();

            } catch (err) {
                console.error(
                    'MongoDB profile loading error:',
                    err.message
                );
            }

            // Listen for app data changes
            document.addEventListener('sans:data', e => {
                if (
                    ['follow', 'posts', 'engine', 'external'].includes(
                        e.detail.type
                    )
                ) {
                    draw();
                }
            });
        }
    };

})();
