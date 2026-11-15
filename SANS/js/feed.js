
/* ==========================================================================
   feed.js — home page: stories, story viewer, composer prompt,
   MongoDB-powered feed, pagination, single-post view and suggestions rail.
   ========================================================================== */

(function () {
  'use strict';

  const { Utils, Store, UI, Posts } = window.SANS;

  const PAGE_SIZE = 8;
  const STORY_MS = 5000;

  /* ======================================================================
     Stories
     ====================================================================== */

  const Stories = {

    groups() {
      const me = Store.me();

      if (!me) return [];

      const ids = [me.id, ...(me.following || [])];
      const byUser = {};

      const stories = Array.isArray(Store.db.stories)
        ? Store.db.stories
        : [];

      stories
        .filter(s => ids.includes(String(s.userId)))
        .sort((a, b) => a.at - b.at)
        .forEach(s => {
          (byUser[s.userId] = byUser[s.userId] || []).push(s);
        });

      return Object.keys(byUser)
        .map(uid => ({
          user: Store.user(uid),
          stories: byUser[uid],
          seen: byUser[uid].every(
            s => (me.seenStories || []).includes(s.id)
          )
        }))
        .filter(g => g.user)
        .sort((a, b) =>
          (a.user.id === me.id ? -1 : b.user.id === me.id ? 1 : 0) ||
          a.seen - b.seen
        );
    },

    render() {
      const me = Store.me();
      const el = Utils.qs('#stories');

      if (!el || !me) return;

      el.innerHTML =
        `<button class="story story--add"
          data-story-add
          aria-label="Add to your story">
          <span class="story__ring">
            <span><i class="fa-solid fa-plus"></i></span>
          </span>
          <span class="story__name">Add story</span>
        </button>` +

        Stories.groups().map((g, i) => `
          <button class="story ${g.seen ? 'is-seen' : ''}"
            data-story="${i}"
            aria-label="View ${Utils.esc(g.user.username)}'s story">

            <span class="story__ring">
              <img src="${Utils.esc(g.user.avatar)}" alt="">
            </span>

            <span class="story__name">
              ${g.user.id === me.id
                ? 'Your story'
                : Utils.esc(g.user.username.split('.')[0])}
            </span>
          </button>
        `).join('');
    },

    open(groupIndex) {
      const me = Store.me();

      if (!me) return;

      let groups = Stories.groups();
      let gi = groupIndex;
      let si = 0;
      let timer = null;
      let start = 0;
      let raf = 0;

      if (!groups[gi]) return;

      const v = document.createElement('div');

      v.className = 'story-viewer';
      v.setAttribute('role', 'dialog');
      v.setAttribute('aria-label', 'Story viewer');

      document.body.appendChild(v);
      document.body.style.overflow = 'hidden';

      const first = groups[gi].stories.findIndex(
        s => !(me.seenStories || []).includes(s.id)
      );

      si = first < 0 ? 0 : first;

      const close = () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);

        v.remove();
        document.body.style.overflow = '';

        document.removeEventListener('keydown', onKey);

        Store.save();
        Stories.render();
      };

      const go = ds => {
        const g = groups[gi];

        if (ds > 0) {
          if (si + 1 < g.stories.length) {
            si++;
          } else if (gi + 1 < groups.length) {
            gi++;
            si = 0;
          } else {
            return close();
          }
        } else if (si > 0) {
          si--;
        } else if (gi > 0) {
          gi--;
          si = groups[gi].stories.length - 1;
        }

        draw();
      };

      const onKey = e => {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight') go(1);
        else if (e.key === 'ArrowLeft') go(-1);
      };

      document.addEventListener('keydown', onKey);

      function draw() {
        cancelAnimationFrame(raf);
        clearTimeout(timer);

        const g = groups[gi];
        const s = g.stories[si];
        const u = g.user;

        if (!s || !u) return close();

        if (!Array.isArray(me.seenStories)) {
          me.seenStories = [];
        }

        if (!me.seenStories.includes(s.id)) {
          me.seenStories.push(s.id);
        }

        v.innerHTML = `
          <div class="story-viewer__frame">

            <div class="story-viewer__bars">
              ${g.stories.map((x, i) => `
                <div class="story-viewer__bar ${i < si ? 'is-done' : ''}">
                  <i></i>
                </div>
              `).join('')}
            </div>

            <div class="story-viewer__head">
              <img class="avatar avatar--sm"
                src="${Utils.esc(u.avatar)}"
                alt="">

              <b>${Utils.esc(u.username)}</b>

              <span style="opacity:.75">
                ${Utils.timeAgo(s.at)}
              </span>

              ${u.id === me.id
                ? `<button class="icon-btn"
                    data-sdel
                    aria-label="Delete story">
                    <i class="fa-solid fa-trash"></i>
                  </button>`
                : ''}

              <button class="icon-btn"
                ${u.id === me.id ? 'style="margin-left:0"' : ''}
                data-sclose
                aria-label="Close">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <img class="story-img"
              src="${Utils.esc(s.image)}"
              alt="Story by ${Utils.esc(u.username)}">

            <button class="story-viewer__tap story-viewer__tap--prev"
              data-sprev
              aria-label="Previous"></button>

            <button class="story-viewer__tap story-viewer__tap--next"
              data-snext
              aria-label="Next"></button>

            ${s.caption
              ? `<div class="story-viewer__caption">
                  ${Utils.esc(s.caption)}
                </div>`
              : ''}

          </div>

          <button class="icon-btn story-viewer__nav story-viewer__nav--prev"
            data-sprev
            aria-label="Previous">
            <i class="fa-solid fa-chevron-left"></i>
          </button>

          <button class="icon-btn story-viewer__nav story-viewer__nav--next"
            data-snext
            aria-label="Next">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        `;

        const bar = v.querySelectorAll(
          '.story-viewer__bar i'
        )[si];

        start = performance.now();

        const step = t => {
          const k = Math.min(1, (t - start) / STORY_MS);

          if (bar) {
            bar.style.width = (k * 100) + '%';
          }

          if (k < 1) {
            raf = requestAnimationFrame(step);
          }
        };

        raf = requestAnimationFrame(step);
        timer = setTimeout(() => go(1), STORY_MS);
      }

      v.addEventListener('click', e => {
        if (
          e.target.closest('[data-sclose]') ||
          e.target === v
        ) {
          return close();
        }

        if (e.target.closest('[data-snext]')) {
          return go(1);
        }

        if (e.target.closest('[data-sprev]')) {
          return go(-1);
        }

        if (e.target.closest('[data-sdel]')) {
          clearTimeout(timer);
          cancelAnimationFrame(raf);

          UI.confirm({
            title: 'Delete this story?',
            message: 'It will be removed for everyone.',
            confirmText: 'Delete story'
          }).then(ok => {
            if (!ok) return draw();

            const story = groups[gi].stories[si];

            Store.db.stories = Store.db.stories.filter(
              x => x.id !== story.id
            );

            Store.save();

            groups = Stories.groups();

            const ng = groups.findIndex(
              g => g.user.id === me.id
            );

            if (ng < 0) return close();

            gi = ng;
            si = Math.min(
              si,
              groups[gi].stories.length - 1
            );

            if (si < 0) return close();

            draw();

            UI.toast('Story deleted.', 'success');
          });
        }
      });

      draw();
    },

    openCreate() {
      const me = Store.me();

      if (!me) return;

      let image = '';

      const m = UI.modal({
        title: 'Add to your story',

        html: `
          <form autocomplete="off">

            <div class="composer__preview hidden" id="sPrev">
              <img alt="Story preview">
            </div>

            <div class="composer__tools" style="margin-bottom:14px">
              <button type="button"
                class="btn btn--ghost btn--sm"
                id="sUpload">
                <i class="fa-regular fa-image"></i>
                Upload photo
              </button>

              <input type="file"
                accept="image/*"
                id="sFile"
                class="hidden">
            </div>

            <div class="field">
              <label for="sUrl">Or paste an image URL</label>
              <input class="input"
                id="sUrl"
                placeholder="https://example.com/photo.jpg">

              <div class="field__error"></div>
            </div>

            <div class="field">
              <label for="sCap">Caption</label>
              <input class="input"
                id="sCap"
                maxlength="80"
                placeholder="Optional">
            </div>

            <button class="btn btn--primary btn--block"
              type="submit"
              id="sGo"
              disabled>
              Share story
            </button>

          </form>
        `
      });

      const $ = s => m.el.querySelector(s);

      const set = src => {
        image = src;

        $('#sPrev').classList.toggle('hidden', !src);

        if (src) {
          $('#sPrev img').src = src;
        }

        $('#sGo').disabled = !src;
      };

      $('#sUpload').onclick = () => {
        $('#sFile').click();
      };

      $('#sFile').onchange = async e => {
        const f = e.target.files[0];

        if (!f) return;

        try {
          set(await Utils.readImage(f, 900));
          $('#sUrl').value = '';
        } catch (err) {
          UI.toast(err.message, 'error');
        }

        e.target.value = '';
      };

      $('#sUrl').onchange = e => {
        const value = e.target.value.trim();

        const err = e.target.parentElement.querySelector(
          '.field__error'
        );

        err.textContent = '';

        if (!value) return set('');

        if (!/^https?:\/\//i.test(value)) {
          err.textContent =
            'Enter a link starting with http:// or https://';

          return set('');
        }

        const img = new Image();

        img.onload = () => set(value);

        img.onerror = () => {
          err.textContent =
            'That link did not load as an image.';

          set('');
        };

        img.src = value;
      };

      $('form').onsubmit = e => {
        e.preventDefault();

        if (!image) return;

        if (!Array.isArray(Store.db.stories)) {
          Store.db.stories = [];
        }

        Store.db.stories.push({
          id: Utils.uid('s'),
          userId: me.id,
          image,
          caption: $('#sCap').value.trim(),
          at: Date.now()
        });

        if (Store.save()) {
          m.close();
          Stories.render();

          UI.toast('Story shared.', 'success');
        }
      };
    }
  };

  /* ======================================================================
     Feed page
     ====================================================================== */

  function renderRail() {
    const me = Store.me();
    const rail = Utils.qs('#rail');

    if (!rail || !me) return;

    rail.innerHTML = `
      <div class="card">
        <div class="user-row" style="padding:0">

          <a href="profile.html">
            ${UI.avatar(me, 'avatar--lg')}
          </a>

          <a class="user-row__meta" href="profile.html">
            <span class="user-row__name">
              ${Utils.esc(me.username)}
            </span>

            <span class="user-row__sub">
              ${Utils.esc(me.name)}
            </span>
          </a>

        </div>
      </div>

      <div class="card">
        <h3>Suggested for you</h3>

        <div id="railSuggest">
          ${UI.suggestedHtml(4)}
        </div>

        <a class="btn btn--ghost btn--sm btn--block"
          style="margin-top:8px"
          href="explore.html">
          See more people
        </a>
      </div>

      <p class="rail-foot">
        SANS · Your people. Your space. Your world.
      </p>
    `;
  }

  window.SANS.pages.feed = {

    shown: 0,

    /* ------------------------------------------------------------------
       Initialize feed
       ------------------------------------------------------------------ */

    async init() {
      const self = this;
      const me = Store.me();

      if (!me) return;

      const composePrompt = Utils.qs('#composePrompt');

      if (composePrompt) {
        composePrompt.innerHTML = `
          <div class="card compose-prompt">

            <a href="profile.html">
              ${UI.avatar(me)}
            </a>

            <button class="fake-input" data-nav-create>
              What is on your mind,
              ${Utils.esc(me.name.split(' ')[0])}?
            </button>

            <button class="icon-btn"
              data-nav-create
              aria-label="Add photo">
              <i class="fa-regular fa-image"></i>
            </button>

          </div>
        `;
      }

      Stories.render();
      renderRail();

      document.addEventListener('click', e => {
        if (e.target.closest('[data-story-add]')) {
          return Stories.openCreate();
        }

        const s = e.target.closest('[data-story]');

        if (s) {
          Stories.open(+s.dataset.story);
        }

        if (e.target.closest('[data-more]')) {
          self.renderMore();
        }
      });

      const focusId = Utils.param('post');

      if (Utils.param('welcome')) {
        setTimeout(() => {
          UI.toast(
            `Welcome to SANS, ${me.name.split(' ')[0]}!`,
            'success'
          );
        }, 500);
      }

      // Show loading skeleton.
      const feed = Utils.qs('#feed');

      if (!feed) return;

      feed.innerHTML = UI.skeletonPosts(3);

      // Fetch posts from MongoDB before rendering.
      await Posts.loadFromMongo();

      if (focusId) {
        self.renderSingle(focusId);
      } else {
        self.renderFeed();
      }

      // Listen only for real post and follow changes.
      document.addEventListener('sans:data', e => {
        const t = e.detail.type;

        if (focusId) {
          if (t === 'posts') {
            Posts.refresh(focusId);
          }

          return;
        }

        if (
          t === 'posts' &&
          (e.detail.created || e.detail.deleted)
        ) {
          self.renderFeed(true);
        } else if (t === 'follow') {
          self.renderFeed(true);
          Stories.render();
          renderRail();
        }
      });
    },

    /* ------------------------------------------------------------------
       Render feed
       ------------------------------------------------------------------ */

    renderFeed(keepCount) {
      const me = Store.me();
      const feed = Utils.qs('#feed');

      if (!me || !feed) return;

      const list = Store.feedFor(me.id);

      if (!list.length) {
        feed.innerHTML = UI.empty(
          'fa-feather',
          'Your feed is quiet',
          'Follow people to see their posts here, or share your first post.',

          `<div style="display:flex;gap:10px;margin-top:8px">
            <a class="btn btn--primary" href="explore.html">
              Find people
            </a>

            <button class="btn btn--ghost" data-nav-create>
              Create post
            </button>
          </div>`
        );

        this.shown = 0;
        return;
      }

      this.shown = keepCount
        ? Math.max(this.shown, PAGE_SIZE)
        : 0;

      feed.innerHTML = '';

      this.renderMore(
        Math.max(this.shown, PAGE_SIZE)
      );
    },

    /* ------------------------------------------------------------------
       Pagination
       ------------------------------------------------------------------ */

    renderMore(total) {
      const feed = Utils.qs('#feed');
      const me = Store.me();

      if (!feed || !me) return;

      const list = Store.feedFor(me.id);

      const from = feed.querySelectorAll('.post').length;
      const to = total || from + PAGE_SIZE;

      feed.querySelector('.load-more')?.remove();

      feed.querySelector('.feed-end')?.remove();

      feed.insertAdjacentHTML(
        'beforeend',
        list
          .slice(from, to)
          .map(p => Posts.card(p))
          .join('')
      );

      this.shown = Math.min(list.length, to);

      feed.insertAdjacentHTML(
        'beforeend',

        this.shown < list.length
          ? `
            <div class="load-more">
              <button class="btn btn--ghost" data-more>
                Load more posts
              </button>
            </div>
          `
          : `
            <p class="muted feed-end"
              style="text-align:center;padding:20px">
              You are all caught up.
            </p>
          `
      );
    },

    /* ------------------------------------------------------------------
       Single post
       ------------------------------------------------------------------ */

    renderSingle(id) {
      const feed = Utils.qs('#feed');

      if (!feed) return;

      const p = Store.post(id);

      const stories = Utils.qs('#stories');
      const composer = Utils.qs('#composePrompt');

      if (stories) {
        stories.classList.add('hidden');
      }

      if (composer) {
        composer.classList.add('hidden');
      }

      if (!p) {
        feed.innerHTML = UI.empty(
          'fa-ghost',
          'Post not found',
          'It may have been deleted.',
          '<a class="btn btn--primary" href="index.html">Back to feed</a>'
        );

        return;
      }

      feed.innerHTML = `
        <div class="card focus-banner">

          <a class="btn btn--ghost btn--sm" href="index.html">
            <i class="fa-solid fa-arrow-left"></i>
            Back to feed
          </a>

          <span class="muted">
            Viewing one post
          </span>

        </div>

        ${Posts.card(p)}
      `;

      const el = feed.querySelector('.post');

      if (el) {
        el.classList.add('comments-open', 'is-highlight');
      }
    }
  };

})();
