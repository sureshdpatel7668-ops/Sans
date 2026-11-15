
/* ==========================================================================
   explore.js — MongoDB discovery: registered users, posts, search,
   suggested users, trending posts and popular-content grid.
   ========================================================================== */
(function () {
  'use strict';

  const { Utils, Store, UI, Posts } = window.SANS;

  const API_URL = '/api/user';

  function getToken() {
    return localStorage.getItem('sans_token');
  }

  // Load only registered MongoDB users.
  async function loadMongoUsers() {
    const token = getToken();

    if (!token) {
      throw new Error('Please log in again.');
    }

    const response = await fetch(`${API_URL}/discover`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok || !data.success || !Array.isArray(data.users)) {
      throw new Error(data.message || 'Unable to load users.');
    }

    const me = Store.me();

    const mongoUsers = data.users.map(user => ({
      id: String(user.id || user._id),
      name: user.name || user.username || 'User',
      username: user.username || 'user',
      avatar: user.avatar || 'assets/images/avatars/av7.svg',
      bio: user.bio || '',
      verified: Boolean(user.verified),
      following: Array.isArray(user.following)
        ? user.following.map(String)
        : [],
      seenStories: [],
      settings: {
        toasts: true,
        emailDigest: false,
        privateProfile: false
      },
      joined: user.createdAt
        ? new Date(user.createdAt).getTime()
        : Date.now()
    }));

    // Keep only current MongoDB account and discovered MongoDB users.
    Store.db.users = [
      ...(me ? [me] : []),
      ...mongoUsers.filter(user => user.id !== String(me?.id))
    ];

    Store.save();

    Utils.emit('users', { loaded: true });

    return mongoUsers;
  }

  const trendingTags = () => {
    const counts = {};

    Store.posts.forEach(post => {
      (post.text.match(/#\w{2,30}/g) || []).forEach(tag => {
        const key = tag.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  };

  const gridItem = (post, big) => {
    const user = Store.user(post.userId);

    return `
      <button
        class="grid__item ${big ? 'grid__item--big' : ''}"
        data-open="${Utils.esc(post.id)}"
        aria-label="Open post by ${Utils.esc(user?.username || '')}"
      >
        ${
          post.image
            ? `<img src="${Utils.esc(post.image)}" alt="" loading="lazy">`
            : `<div class="grid__text">${Utils.esc(post.text)}</div>`
        }

        <span class="grid__hover">
          <span><i class="fa-solid fa-heart"></i> ${post.likes.length}</span>
          <span><i class="fa-solid fa-comment"></i> ${post.comments.length}</span>
        </span>
      </button>
    `;
  };

  window.SANS.pages.explore = {
    tab: 'top',

    async init() {
      const input = Utils.qs('#q');
      const root = Utils.qs('#exploreRoot');

      if (!input || !root) return;

      const self = this;
      const q0 = Utils.param('q');

      if (q0) input.value = q0;

      const run = () => self.render(root, input.value.trim());

      input.addEventListener('input', Utils.debounce(run, 180));

      const clearButton = Utils.qs('#clearQ');

      if (clearButton) {
        clearButton.addEventListener('click', () => {
          input.value = '';
          input.focus();
          run();
        });
      }

      const form = Utils.qs('#exploreForm');

      if (form) {
        form.addEventListener('submit', e => e.preventDefault());
      }

      root.addEventListener('click', e => {
        const open = e.target.closest('[data-open]');

        if (open) {
          return Posts.openPost(open.dataset.open);
        }

        const tab = e.target.closest('[data-tab]');

        if (tab) {
          self.tab = tab.dataset.tab;
          return run();
        }

        const chip = e.target.closest('[data-q]');

        if (chip) {
          input.value = chip.dataset.q;
          run();

          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          });
        }
      });

      root.innerHTML = UI.skeletonPosts(1);

      try {
        await loadMongoUsers();

        await Posts.loadFromMongo();

        run();
      } catch (error) {
        console.error('Explore loading error:', error);

        root.innerHTML = UI.empty(
          'fa-circle-exclamation',
          'Could not load Explore',
          error.message || 'Please refresh and try again.'
        );
      }

      document.addEventListener('sans:data', e => {
        if (
          ['follow', 'posts', 'external', 'users'].includes(e.detail.type) &&
          !e.detail.created
        ) {
          run();
        }
      });
    },

    render(root, q) {
      const clearButton = Utils.qs('#clearQ');

      if (clearButton) {
        clearButton.classList.toggle('hidden', !q);
      }

      if (q) {
        return this.renderResults(root, q);
      }

      const me = Store.me();

      if (!me) {
        root.innerHTML = UI.empty(
          'fa-user-lock',
          'Login required',
          'Please log in to explore SANS.'
        );
        return;
      }

      const posts = Store.posts.slice();

      const trending = posts.sort(
        (a, b) => Store.score(b) - Store.score(a)
      );

      const popular = trending
        .filter(post => post.image)
        .slice(0, 12);

      const suggested = Store.suggested(me.id, 8);
      const tags = trendingTags();

      root.innerHTML = `
        ${
          suggested.length
            ? `
              <h2 class="section-title">
                <i class="fa-solid fa-user-plus"></i>
                Suggested people
              </h2>

              <div class="suggest-row">
                ${suggested.map(user => `
                  <div class="card suggest-card">
                    <a href="profile.html?u=${Utils.esc(user.username)}">
                      ${UI.avatar(user)}
                    </a>

                    <a
                      class="user-row__name"
                      href="profile.html?u=${Utils.esc(user.username)}"
                      style="max-width:140px"
                    >
                      ${Utils.esc(user.username)}
                      ${UI.verified(user)}
                    </a>

                    <span class="user-row__sub" style="max-width:140px">
                      ${Utils.num(Store.followers(user.id).length)}
                      followers
                    </span>

                    ${UI.followBtn(user)}
                  </div>
                `).join('')}
              </div>
            `
            : ''
        }

        ${
          tags.length
            ? `
              <h2 class="section-title">
                <i class="fa-solid fa-hashtag"></i>
                Topics
              </h2>

              <div class="tag-row">
                ${tags.map(([tag, count]) => `
                  <button class="chip" data-q="${Utils.esc(tag)}">
                    ${Utils.esc(tag)}
                    <span class="muted">${count}</span>
                  </button>
                `).join('')}
              </div>
            `
            : ''
        }

        <h2 class="section-title">
          <i class="fa-solid fa-fire"></i>
          Trending now
        </h2>

        ${
          trending.length
            ? `
              <div class="trending">
                ${trending.slice(0, 5).map((post, index) => {
                  const user = Store.user(post.userId);

                  return `
                    <div
                      class="card trend"
                      data-open="${Utils.esc(post.id)}"
                      tabindex="0"
                      role="button"
                    >
                      <span class="trend__rank">${index + 1}</span>

                      ${
                        post.image
                          ? `<img class="trend__img" src="${Utils.esc(post.image)}" alt="">`
                          : `
                            <span class="trend__img"
                              style="display:grid;place-items:center;color:var(--muted)">
                              <i class="fa-solid fa-quote-left"></i>
                            </span>
                          `
                      }

                      <div class="trend__body">
                        <p>${Utils.esc(post.text || 'Photo post')}</p>

                        <div class="trend__meta">
                          ${Utils.esc(user?.username || 'Unknown user')}
                          · ${post.likes.length} likes
                          · ${post.comments.length} comments
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `
            : UI.empty(
                'fa-fire',
                'Nothing trending yet',
                'Posts will appear here when people start sharing.'
              )
        }

        <h2 class="section-title">
          <i class="fa-solid fa-images"></i>
          Popular content
        </h2>

        ${
          popular.length
            ? `
              <div class="grid">
                ${popular.map((post, index) => gridItem(post, index === 0)).join('')}
              </div>
            `
            : UI.empty(
                'fa-image',
                'Nothing popular yet',
                'Posts with photos will show up here.'
              )
        }
      `;
    },

    renderResults(root, q) {
      const term = q.replace(/^@/, '').toLowerCase();

      // Search only MongoDB users.
      const users = Store.users.filter(user =>
        String(user.username || '').toLowerCase().includes(term) ||
        String(user.name || '').toLowerCase().includes(term)
      );

      // Search only MongoDB posts loaded by Posts.loadFromMongo().
      const posts = Store.posts
        .filter(post =>
          String(post.text || '').toLowerCase().includes(q.toLowerCase()) ||
          String(Store.user(post.userId)?.username || '')
            .toLowerCase()
            .includes(term)
        )
        .sort((a, b) => Store.score(b) - Store.score(a));

      const tab = this.tab;

      const tabs = `
        <div class="tabs" role="tablist">
          ${[
            ['top', 'Top'],
            ['people', `People (${users.length})`],
            ['posts', `Posts (${posts.length})`]
          ].map(([key, label]) => `
            <button
              class="tab ${tab === key ? 'is-active' : ''}"
              role="tab"
              aria-selected="${tab === key}"
              data-tab="${key}"
            >
              ${label}
            </button>
          `).join('')}
        </div>
      `;

      const peopleHtml = users.length
        ? `
          <div class="card" style="padding:6px 16px">
            ${users.map(user => UI.userRow(user, {
              sub: `${user.name} · ${Utils.num(Store.followers(user.id).length)} followers`
            })).join('')}
          </div>
        `
        : '';

      const postsHtml = posts.length
        ? `<div class="grid">${posts.map(post => gridItem(post)).join('')}</div>`
        : '';

      let body = '';

      if (tab === 'people') {
        body = peopleHtml || UI.empty(
          'fa-user-slash',
          'No people found',
          `No one matches "${q}".`
        );
      } else if (tab === 'posts') {
        body = postsHtml || UI.empty(
          'fa-magnifying-glass',
          'No posts found',
          `No posts mention "${q}".`
        );
      } else {
        body = (users.length || posts.length)
          ? (
              (users.length
                ? `<h2 class="section-title">People</h2>${peopleHtml}`
                : '') +
              (posts.length
                ? `<h2 class="section-title">Posts</h2>${postsHtml}`
                : '')
            )
          : UI.empty(
              'fa-magnifying-glass',
              'No results',
              `Nothing matches "${q}". Try a username, a keyword or a #hashtag.`
            );
      }

      root.innerHTML = tabs + body;
    }
  };
})();
