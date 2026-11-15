
/* ==========================================================================
   app.js — SANS core
   Utils · Store · UI helpers · Engine (disabled) · Theme · Bootstrapping
   MongoDB is the source of truth for application data.
   ========================================================================== */

(function () {
  'use strict';

  const SANS = (window.SANS = { pages: {} });

  const DB_KEY = 'sans_db_v1';
  const SESSION_KEY = 'sans_session';
  const THEME_KEY = 'sans_theme';

  /* ======================================================================
     Utils
     ====================================================================== */

  const Utils = {
    uid: (p = 'id') =>
      p + '_' + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7),

    qs: (s, r = document) => r.querySelector(s),

    qsa: (s, r = document) => Array.from(r.querySelectorAll(s)),

    param: (k) => new URLSearchParams(location.search).get(k),

    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],

    shuffle: (arr) =>
      arr.map(v => [Math.random(), v])
        .sort((a, b) => a[0] - b[0])
        .map(x => x[1]),

    rand: (a, b) => a + Math.random() * (b - a),

    /** Escape text for safe insertion into HTML. */
    esc(s) {
      return String(s == null ? '' : s).replace(
        /[&<>"']/g,
        c => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c])
      );
    },

    /** Escape then turn hashtags and mentions into links. */
    rich(text) {
      return Utils.esc(text)
        .replace(
          /(^|\s)#([\w]{2,30})/g,
          (m, sp, t) =>
            `${sp}<a href="explore.html?q=%23${t}">#${t}</a>`
        )
        .replace(
          /(^|\s)@([\w.]{2,20})/g,
          (m, sp, n) =>
            Store.userByName(n)
              ? `${sp}<a href="profile.html?u=${n}">@${n}</a>`
              : m
        );
    },

    timeAgo(ts) {
      const s = Math.max(0, (Date.now() - ts) / 1000);

      if (s < 45) return 'now';
      if (s < 3600) return Math.round(s / 60) + 'm';
      if (s < 86400) return Math.floor(s / 3600) + 'h';
      if (s < 604800) return Math.floor(s / 86400) + 'd';

      return new Date(ts).toLocaleDateString(
        undefined,
        { month: 'short', day: 'numeric' }
      );
    },

    clock: (ts) =>
      new Date(ts).toLocaleTimeString(
        [],
        { hour: 'numeric', minute: '2-digit' }
      ),

    fullDate: (ts) =>
      new Date(ts).toLocaleString(
        [],
        { dateStyle: 'medium', timeStyle: 'short' }
      ),

    dayLabel(ts) {
      const d = new Date(ts);
      const t = new Date();

      const day = (x) =>
        new Date(
          x.getFullYear(),
          x.getMonth(),
          x.getDate()
        ).getTime();

      const diff = Math.round((day(t) - day(d)) / 864e5);

      if (diff === 0) return 'Today';
      if (diff === 1) return 'Yesterday';

      return d.toLocaleDateString(
        [],
        {
          weekday: 'long',
          month: 'short',
          day: 'numeric'
        }
      );
    },

    num(n) {
      return n >= 1e6
        ? (n / 1e6).toFixed(1).replace('.0', '') + 'M'
        : n >= 1e4
          ? (n / 1e3).toFixed(1).replace('.0', '') + 'K'
          : String(n);
    },

    debounce(fn, ms = 200) {
      let t;

      return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
      };
    },

    isValidImageSrc: (s) =>
      /^(https?:\/\/|data:image\/|assets\/)/i.test(s),

    /** Read an image File, downscale it and return a JPEG data URL. */
    readImage(file, maxDim = 1000) {
      return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type)) {
          return reject(
            new Error('Please choose an image file.')
          );
        }

        if (file.size > 12 * 1024 * 1024) {
          return reject(
            new Error(
              'That image is over 12 MB. Choose a smaller one.'
            )
          );
        }

        const reader = new FileReader();

        reader.onerror = () =>
          reject(new Error('Could not read that file.'));

        reader.onload = () => {
          const im = new Image();

          im.onerror = () =>
            reject(new Error('That file is not a valid image.'));

          im.onload = () => {
            const k = Math.min(
              1,
              maxDim / Math.max(im.width, im.height)
            );

            const c = document.createElement('canvas');

            c.width = Math.round(im.width * k);
            c.height = Math.round(im.height * k);

            c.getContext('2d').drawImage(
              im,
              0,
              0,
              c.width,
              c.height
            );

            resolve(c.toDataURL('image/jpeg', 0.82));
          };

          im.src = reader.result;
        };

        reader.readAsDataURL(file);
      });
    },

    async copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        const t = document.createElement('textarea');

        t.value = text;
        t.style.position = 'fixed';
        t.style.opacity = '0';

        document.body.appendChild(t);
        t.select();

        let ok = false;

        try {
          ok = document.execCommand('copy');
        } catch (e2) {
          // Ignore clipboard fallback errors.
        }

        t.remove();

        return ok;
      }
    },

    emit(type, detail = {}) {
      document.dispatchEvent(
        new CustomEvent('sans:data', {
          detail: { type, ...detail }
        })
      );
    }
  };


  /* ======================================================================
     Store — local cache for MongoDB data
     ====================================================================== */

  const Store = {
    db: null,

    load() {
      try {
        const raw = localStorage.getItem(DB_KEY);
        this.db = raw ? JSON.parse(raw) : null;
      } catch (e) {
        this.db = null;
      }

      if (!this.db || this.db.version !== 1) {
        this.db = SANS_DATA.create();
        this.save();
        return;
      }

      const isMongoId = (id) =>
        typeof id === 'string' &&
        /^[a-f\d]{24}$/i.test(id);

      this.db.users = Array.isArray(this.db.users)
        ? this.db.users
        : [];

      this.db.posts = Array.isArray(this.db.posts)
        ? this.db.posts
        : [];

      this.db.notifications = Array.isArray(this.db.notifications)
        ? this.db.notifications
        : [];

      this.db.conversations = Array.isArray(this.db.conversations)
        ? this.db.conversations
        : [];

      this.db.users = this.db.users.filter(
        user =>
          user &&
          isMongoId(String(user.id || ''))
      );

      this.db.posts = this.db.posts.filter(
        post =>
          post &&
          isMongoId(String(post.id || '')) &&
          isMongoId(String(post.userId || ''))
      );

      this.db.notifications = this.db.notifications.filter(
        notification =>
          notification &&
          isMongoId(String(notification.id || '')) &&
          isMongoId(String(notification.to || '')) &&
          isMongoId(String(notification.from || ''))
      );

      this.db.conversations = this.db.conversations.filter(
        conversation =>
          conversation &&
          isMongoId(String(conversation.id || ''))
      );

      this.db.stories = [];
      this.db.queue = [];

      this.db.users.forEach(user => {
        user.following = Array.isArray(user.following)
          ? user.following.filter(isMongoId)
          : [];
      });

      this.save();
    },

    save() {
      try {
        localStorage.setItem(
          DB_KEY,
          JSON.stringify(this.db)
        );

        return true;
      } catch (e) {
        UI.toast(
          'Storage is full. Remove some posts or use smaller images.',
          'error'
        );

        return false;
      }
    },

    reset() {
      localStorage.removeItem(DB_KEY);
      this.load();
    },

    sessionId() {
      try {
        return (
          sessionStorage.getItem(SESSION_KEY) ||
          localStorage.getItem(SESSION_KEY)
        );
      } catch (e) {
        return null;
      }
    },

    setSession(id, remember) {
      this.clearSession();

      try {
        (
          remember
            ? localStorage
            : sessionStorage
        ).setItem(SESSION_KEY, id);
      } catch (e) {
        // Ignore session storage errors.
      }
    },

    clearSession() {
      try {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {
        // Ignore session storage errors.
      }
    },

    me() {
      const id = this.sessionId();
      return id ? this.user(id) : null;
    },

    get users() {
      return this.db.users;
    },

    get posts() {
      return this.db.posts;
    },

    user: (id) =>
      Store.db.users.find(
        u => String(u.id) === String(id)
      ),

    userByName: (n) =>
      Store.db.users.find(
        u =>
          String(u.username || '').toLowerCase() ===
          String(n || '').toLowerCase()
      ),

    post: (id) =>
      Store.db.posts.find(
        p => String(p.id) === String(id)
      ),

    postsBy: (uid) =>
      Store.db.posts
        .filter(p => String(p.userId) === String(uid))
        .sort((a, b) => b.at - a.at),

    followers: (uid) =>
      Store.db.users.filter(
        u =>
          Array.isArray(u.following) &&
          u.following.some(
            id => String(id) === String(uid)
          )
      ),

    following: (uid) =>
      (Store.user(uid)?.following || [])
        .map(Store.user)
        .filter(Boolean),

    isFollowing: (a, b) =>
      !!Store.user(a)?.following?.some(
        id => String(id) === String(b)
      ),

    conv: (id) =>
      Store.db.conversations.find(
        c => String(c.id) === String(id)
      ),

    feedFor(uid) {
      const me = this.user(uid);

      if (!me) return [];

      const following = Array.isArray(me.following)
        ? me.following.map(String)
        : [];

      return this.db.posts
        .filter(
          p =>
            String(p.userId) === String(uid) ||
            following.includes(String(p.userId))
        )
        .sort((a, b) => b.at - a.at);
    },

    score: (p) =>
      (p.likes?.length || 0) * 2 +
      (p.comments?.length || 0) * 3 +
      Math.max(
        0,
        6 - (Date.now() - p.at) / 864e5
      ),

    suggested(uid, limit = 5) {
      const me = this.user(uid);

      if (!me) return [];

      const following = Array.isArray(me.following)
        ? me.following.map(String)
        : [];

      return this.db.users
        .filter(
          u =>
            String(u.id) !== String(uid) &&
            !following.includes(String(u.id))
        )
        .map(u => ({
          u,
          s:
            this.followers(u.id).length +
            (
              this.followers(u.id).some(
                f => following.includes(String(f.id))
              )
                ? 3
                : 0
            )
        }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map(x => x.u);
    },

    toggleFollow(meId, targetId) {
      const me = this.user(meId);
      const target = this.user(targetId);

      if (!me || !target || meId === targetId) {
        return false;
      }

      if (!Array.isArray(me.following)) {
        me.following = [];
      }

      const index = me.following.findIndex(
        id => String(id) === String(targetId)
      );

      if (index >= 0) {
        me.following.splice(index, 1);

        this.save();
        Utils.emit('follow');

        return false;
      }

      me.following.push(targetId);

      this.save();
      Utils.emit('follow');

      return true;
    },

    notify() {
      return false;
    },

    schedule() {
      return false;
    },

    unreadNotifs: (uid) =>
      Store.db.notifications.filter(
        n =>
          String(n.to) === String(uid) &&
          !n.read
      ).length,

    unreadMessages: (uid) =>
      Store.db.conversations
        .filter(
          c =>
            Array.isArray(c.members) &&
            c.members.some(
              id => String(id) === String(uid)
            )
        )
        .reduce(
          (s, c) =>
            s + ((c.unread || {})[uid] || 0),
          0
        ),

    getOrCreateConv(a, b) {
      let c = this.db.conversations.find(
        c =>
          c.members.includes(a) &&
          c.members.includes(b) &&
          a !== b
      );

      if (!c) {
        c = {
          id: Utils.uid('cv'),
          members: [a, b],
          unread: {},
          messages: []
        };

        this.db.conversations.push(c);
        this.save();
      }

      return c;
    },

    sendMessage(convId, fromId, text) {
      const c = this.conv(convId);

      if (!c) return null;

      const m = {
        id: Utils.uid('m'),
        from: fromId,
        text,
        at: Date.now()
      };

      c.messages.push(m);

      const other = c.members.find(
        x => x !== fromId
      );

      this.save();

      return { m, other };
    }
  };


  /* ======================================================================
     UI — toast, modal, confirm, dropdown, shared fragments
     ====================================================================== */

  const modalStack = [];

  const UI = {
    toast(message, type = 'info', opts = {}) {
      let stack = Utils.qs('#toasts');

      if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toasts';
        stack.className = 'toast-stack';
        stack.setAttribute('aria-live', 'polite');

        document.body.appendChild(stack);
      }

      const icon = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        info: 'fa-circle-info'
      }[type] || 'fa-circle-info';

      const el = document.createElement('div');

      el.className = `toast toast--${type}`;

      el.innerHTML =
        `<i class="fa-solid ${icon}"></i>` +
        `<span>${Utils.esc(message)}` +
        (
          opts.href
            ? ` <a href="${Utils.esc(opts.href)}">` +
              `${Utils.esc(opts.linkText || 'View')}</a>`
            : ''
        ) +
        `</span>`;

      stack.appendChild(el);

      while (stack.children.length > 3) {
        stack.firstChild.remove();
      }

      setTimeout(() => {
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 240);
      }, opts.duration || 3400);
    },

    modal({
      title = '',
      html = '',
      size = '',
      foot = '',
      onClose,
      bare = false
    } = {}) {
      const back = document.createElement('div');

      back.className = 'modal-backdrop';

      back.innerHTML = `
        <div class="modal ${size ? 'modal--' + size : ''}"
          role="dialog"
          aria-modal="true"
          aria-label="${Utils.esc(title)}">

          ${
            bare
              ? ''
              : `
                <div class="modal__head">
                  <h3>${Utils.esc(title)}</h3>
                  <button class="icon-btn" data-close aria-label="Close">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
              `
          }

          <div class="modal__body" ${bare ? 'style="padding:0"' : ''}>
            ${html}
          </div>

          ${
            foot
              ? `<div class="modal__foot">${foot}</div>`
              : ''
          }
        </div>
      `;

      document.body.appendChild(back);
      document.body.style.overflow = 'hidden';

      const prevFocus = document.activeElement;

      const api = {
        el: back,
        body: back.querySelector('.modal__body'),
        modal: back.querySelector('.modal'),

        close() {
          if (!back.isConnected) return;

          back.classList.add('is-closing');

          setTimeout(() => back.remove(), 150);

          const i = modalStack.indexOf(api);

          if (i >= 0) {
            modalStack.splice(i, 1);
          }

          if (!modalStack.length) {
            document.body.style.overflow = '';
          }

          try {
            prevFocus &&
              prevFocus.focus &&
              prevFocus.focus();
          } catch (e) {
            // Ignore focus errors.
          }

          onClose && onClose();
        }
      };

      back.addEventListener('mousedown', e => {
        if (e.target === back) {
          api.close();
        }
      });

      back.addEventListener('click', e => {
        if (e.target.closest('[data-close]')) {
          api.close();
        }
      });

      modalStack.push(api);

      const f = back.querySelector(
        '[autofocus], textarea, input'
      );

      if (f) {
        setTimeout(() => f.focus(), 30);
      }

      return api;
    },

    confirm({
      title = 'Are you sure?',
      message = '',
      confirmText = 'Confirm',
      danger = true,
      icon = 'fa-trash'
    } = {}) {
      return new Promise(resolve => {
        let done = false;

        const m = UI.modal({
          title: '',
          size: 'sm',
          bare: true,

          html: `
            <div style="padding:22px">
              <div class="confirm-icon"
                ${
                  danger
                    ? ''
                    : 'style="background:var(--accent-soft);color:var(--accent)"'
                }>
                <i class="fa-solid ${icon}"></i>
              </div>

              <h3>${Utils.esc(title)}</h3>

              <p class="confirm-text">
                ${Utils.esc(message)}
              </p>
            </div>
          `,

          foot: `
            <button class="btn btn--ghost" data-no>
              Cancel
            </button>

            <button class="btn ${
              danger ? 'btn--danger' : 'btn--primary'
            }" data-yes>
              ${Utils.esc(confirmText)}
            </button>
          `,

          onClose: () => {
            if (!done) {
              done = true;
              resolve(false);
            }
          }
        });

        m.el.querySelector('[data-yes]').focus();

        m.el.querySelector('[data-no]').onclick = () =>
          m.close();

        m.el.querySelector('[data-yes]').onclick = () => {
          done = true;
          resolve(true);
          m.close();
        };
      });
    },

    dropdown(anchor, items) {
      UI.closeDropdown();

      const d = document.createElement('div');

      d.className = 'dropdown';
      d.setAttribute('role', 'menu');

      d.innerHTML = items.map((it, i) => {
        if (it === 'hr') return '<hr>';

        const start = it.href
          ? `<a role="menuitem" href="${Utils.esc(it.href)}"`
          : `<button role="menuitem" data-i="${i}"`;

        const end = it.href ? '</a>' : '</button>';

        return (
          start +
          ` class="${it.danger ? 'is-danger' : ''}">` +
          `<i class="fa-solid ${it.icon || 'fa-circle'}"></i>` +
          Utils.esc(it.label) +
          end
        );
      }).join('');

      document.body.appendChild(d);

      const r = anchor.getBoundingClientRect();
      const w = d.offsetWidth;
      const h = d.offsetHeight;

      const left = Math.min(
        Math.max(8, r.right - w),
        window.innerWidth - w - 8
      );

      let top = r.bottom + 6;

      if (top + h > window.innerHeight - 8) {
        top = Math.max(8, r.top - h - 6);
      }

      d.style.left = left + 'px';
      d.style.top = top + 'px';

      d.addEventListener('click', e => {
        const b = e.target.closest('button[data-i]');

        if (!b) return;

        const it = items[+b.dataset.i];

        UI.closeDropdown();

        it.onClick && it.onClick();
      });

      UI._dd = d;

      const f = d.querySelector('button, a');

      if (f) {
        f.focus({ preventScroll: true });
      }
    },

    closeDropdown() {
      if (UI._dd) {
        UI._dd.remove();
        UI._dd = null;
      }
    },

    skeletonPosts(n = 3) {
      return Array.from(
        { length: n },
        () => `
          <div class="card sk-post" aria-hidden="true">
            <div class="sk-row">
              <div class="skeleton sk-circle"></div>

              <div style="flex:1">
                <div class="skeleton sk-line" style="width:35%"></div>
                <div class="skeleton sk-line" style="width:20%;margin:0"></div>
              </div>
            </div>

            <div class="skeleton sk-line" style="width:90%"></div>
            <div class="skeleton sk-line" style="width:65%"></div>
            <div class="skeleton sk-img"></div>
          </div>
        `
      ).join('');
    },

    empty(icon, title, text, actionHtml = '') {
      return `
        <div class="empty">
          <div class="empty__icon">
            <i class="fa-solid ${icon}"></i>
          </div>

          <h3>${Utils.esc(title)}</h3>
          <p>${Utils.esc(text)}</p>
          ${actionHtml}
        </div>
      `;
    },

    avatar(u, cls = '') {
      return `
        <img
          class="avatar ${cls}"
          src="${Utils.esc(
            u
              ? u.avatar
              : 'assets/images/avatars/av7.svg'
          )}"
          alt=""
          loading="lazy"
        >
      `;
    },

    verified: (u) =>
      u && u.verified
        ? '<i class="fa-solid fa-circle-check verified" title="Verified"></i>'
        : '',

    followBtn(u, cls = 'btn--sm') {
      const me = Store.me();

      if (!me || !u || u.id === me.id) {
        return '';
      }

      const on = Store.isFollowing(me.id, u.id);
      const back = !on && Store.isFollowing(u.id, me.id);

      return `
        <button
          class="btn ${cls} ${
            on ? 'btn--ghost' : 'btn--primary'
          }"
          data-follow="${u.id}"
          aria-pressed="${on}"
        >
          ${on ? 'Following' : back ? 'Follow back' : 'Follow'}
        </button>
      `;
    },

    userRow(u, { sub, follow = true } = {}) {
      return `
        <div class="user-row">
          <a href="profile.html?u=${Utils.esc(u.username)}">
            ${UI.avatar(u)}
          </a>

          <a
            class="user-row__meta"
            href="profile.html?u=${Utils.esc(u.username)}"
          >
            <span class="user-row__name">
              ${Utils.esc(u.username)}
              ${UI.verified(u)}
            </span>

            <span class="user-row__sub">
              ${Utils.esc(sub != null ? sub : u.name)}
            </span>
          </a>

          ${follow ? UI.followBtn(u) : ''}
        </div>
      `;
    },

    suggestedHtml(limit = 4) {
      const me = Store.me();

      if (!me) return '';

      const list = Store.suggested(me.id, limit);

      if (!list.length) {
        return '<p class="muted">You follow everyone. Nice.</p>';
      }

      return list.map(u =>
        UI.userRow(u, {
          sub: Store.followers(u.id).length + ' followers'
        })
      ).join('');
    }
  };


  /* ======================================================================
     Engine — simulated demo activity disabled.
     ====================================================================== */

  const Engine = {
    tick() {
      return;
    },

    toast() {
      return;
    },

    run() {
      return;
    }
  };


  /* ======================================================================
     Theme
     ====================================================================== */

  const Theme = {
    get() {
      try {
        return localStorage.getItem(THEME_KEY) || 'dark';
      } catch (e) {
        return 'dark';
      }
    },

    set(t) {
      document.documentElement.dataset.theme = t;

      try {
        localStorage.setItem(THEME_KEY, t);
      } catch (e) {
        // Ignore storage errors.
      }
    },

    motion() {
      try {
        return localStorage.getItem('sans_motion') || 'full';
      } catch (e) {
        return 'full';
      }
    },

    setMotion(v) {
      document.documentElement.dataset.motion = v;

      try {
        localStorage.setItem('sans_motion', v);
      } catch (e) {
        // Ignore storage errors.
      }
    },

    init() {
      document.documentElement.dataset.theme = Theme.get();
      document.documentElement.dataset.motion = Theme.motion();
    }
  };


  /* ======================================================================
     Attach modules to shared namespace
     ====================================================================== */

  Object.assign(SANS, {
    Utils,
    Store,
    UI,
    Engine,
    Theme
  });


  /* ======================================================================
     Global delegated handlers
     ====================================================================== */

  document.addEventListener('error', (e) => {
    const t = e.target;

    if (!(t instanceof HTMLImageElement)) return;

    if (
      t.classList.contains('avatar') ||
      t.classList.contains('profile-head__avatar')
    ) {
      if (!t.dataset.fb) {
        t.dataset.fb = 1;
        t.src = 'assets/images/avatars/av7.svg';
      }
    } else {
      const m = t.closest('.post__media');

      if (m) {
        m.classList.add('is-broken');
      } else {
        t.style.visibility = 'hidden';
      }
    }
  }, true);


  /* ======================================================================
     Follow buttons — MongoDB API
     ====================================================================== */

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-follow]');

    if (!b) return;

    e.preventDefault();

    const me = Store.me();

    if (!me) {
      UI.toast('Please login first.', 'error');
      return;
    }

    const uid = b.dataset.follow;
    const u = Store.user(uid);

    if (!u || String(me.id) === String(uid)) {
      return;
    }

    if (b.disabled) return;

    const token = localStorage.getItem('sans_token');

    if (!token) {
      UI.toast('Please login again.', 'error');
      return;
    }

    if (!/^[a-f\d]{24}$/i.test(uid)) {
      UI.toast(
        'This account is not available in MongoDB yet.',
        'error'
      );

      return;
    }

    b.disabled = true;

    try {
      const response = await fetch(
        `/api/user/${encodeURIComponent(uid)}/follow`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || 'Unable to update follow status.'
        );
      }

      if (!Array.isArray(me.following)) {
        me.following = [];
      }

      const index = me.following.findIndex(
        id => String(id) === String(uid)
      );

      if (data.following && index === -1) {
        me.following.push(uid);
      } else if (!data.following && index !== -1) {
        me.following.splice(index, 1);
      }

      Store.save();

      Utils.emit('follow');

      Utils.qsa(`[data-follow="${uid}"]`).forEach(x => {
        const match = x.className.match(/btn--(sm|lg)/);
        const cls = match ? `btn--${match[1]}` : '';

        x.outerHTML = UI.followBtn(u, cls);
      });

      UI.toast(
        data.following
          ? `You are now following ${u.username}.`
          : `You unfollowed ${u.username}.`,
        'success'
      );

    } catch (err) {
      console.error('Follow error:', err);

      UI.toast(
        err.message || 'Something went wrong.',
        'error'
      );

      b.disabled = false;
    }
  });


  // Close dropdown when clicking outside.
  document.addEventListener('click', (e) => {
    if (
      UI._dd &&
      !e.target.closest('.dropdown')
    ) {
      UI.closeDropdown();
    }
  }, true);


  window.addEventListener('resize', () => {
    UI.closeDropdown();
  });


  // Escape key closes dropdown or top modal.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    if (UI._dd) {
      return UI.closeDropdown();
    }

    const top = modalStack[modalStack.length - 1];

    if (top) {
      top.close();
    }
  });


  // Keep tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) {
      Store.load();
      Utils.emit('external');
    }

    if (
      e.key === SESSION_KEY &&
      !e.newValue &&
      document.body.hasAttribute('data-protected')
    ) {
      location.replace('login.html');
    }
  });


  /* ======================================================================
     Bootstrap
     ====================================================================== */

  function boot() {
    Theme.init();

    Store.load();

    const body = document.body;
    const page = body.dataset.page;
    const isProtected = body.hasAttribute('data-protected');
    const me = Store.me();

    // IMPORTANT: Redirect logged-out visitors to login.
    if (isProtected && !me) {
      location.replace('login.html');
      return;
    }

    // Render navigation for logged-in users.
    if (isProtected && me) {
      SANS.Nav && SANS.Nav.render();
    }

    // Auth pages bounce signed-in users.
    if (!isProtected && me && !Utils.param('force')) {
      location.replace('index.html');
      return;
    }

    // Simulated Engine activity is disabled.
    // MongoDB APIs handle real application activity.

    const pg = SANS.pages[page];

    try {
      pg && pg.init && pg.init();
    } catch (err) {
      console.error(err);

      UI.toast(
        'Something went wrong loading this page.',
        'error'
      );
    }

    requestAnimationFrame(() => {
      body.classList.remove('is-loading');

      const m = Utils.qs('.main, .auth');

      if (m) {
        m.classList.add('page-enter');
      }
    });
  }


  document.addEventListener('DOMContentLoaded', boot);


  // Restore page when coming back via browser back/forward cache.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      document.body.classList.remove('is-leaving');
    }
  });

})();
