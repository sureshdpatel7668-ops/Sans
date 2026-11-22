
/* ==========================================================================
   auth.js — MongoDB API based registration, login and logout.
   Passwords are handled securely by the backend.
   ========================================================================== */

(function () {
  'use strict';

  const { Utils, Store, UI } = window.SANS;

  const AVATARS = Array.from(
    { length: 12 },
    (_, i) => `assets/images/avatars/av${i + 1}.svg`
  );

  const API = '/api/auth';

  /* ---------- Validation rules ---------- */

  const Rules = {
    name: (v) =>
      !v.trim()
        ? 'Enter your full name.'
        : v.trim().length < 2
          ? 'Name must be at least 2 characters.'
          : v.trim().length > 40
            ? 'Name must be 40 characters or fewer.'
            : '',

    username(v, ignoreId) {
      if (!v) return 'Choose a username.';

      if (v.length < 3 || v.length > 20) {
        return 'Username must be 3 to 20 characters.';
      }

      if (!/^[a-zA-Z0-9._]+$/.test(v)) {
        return 'Use only letters, numbers, dots and underscores.';
      }

      const taken = Store.userByName(v);

      if (taken && taken.id !== ignoreId) {
        return 'Please try another username.';
      }

      return '';
    },

    password: (v) =>
      !v
        ? 'Enter a password.'
        : v.length < 8
          ? 'Password must be at least 8 characters.'
          : !/[a-zA-Z]/.test(v) || !/\d/.test(v)
            ? 'Include at least one letter and one number.'
            : '',

    strength(v) {
      let s = 0;

      if (v.length >= 8) s++;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
      if (/\d/.test(v)) s++;
      if (/[^a-zA-Z0-9]/.test(v) || v.length >= 12) s++;

      return v ? Math.max(1, s) : 0;
    }
  };

  /* ---------- Backend API ---------- */

  async function apiRequest(endpoint, body) {
    const response = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message ||
        data.error ||
        'Something went wrong. Please try again.'
      );
    }

    return data;
  }

  /* ---------- Sync backend user with frontend Store ---------- */

  function syncUser(apiUser, remember = true) {
    const id = String(apiUser.id || apiUser._id || '');

    if (!id) {
      throw new Error('Server did not return a valid user ID.');
    }

    const existing = Store.db.users.find(
      user => String(user.id) === id
    );

    const user = {
      id,
      name: apiUser.name || '',
      username: apiUser.username || '',
      bio: apiUser.bio || '',
      avatar: apiUser.avatar || AVATARS[0],
      verified: !!apiUser.verified,
      following: Array.isArray(apiUser.following)
        ? apiUser.following.map(String)
        : [],
      seenStories: existing?.seenStories || [],
      settings: existing?.settings || {
        toasts: true,
        emailDigest: false,
        privateProfile: false
      },
      joined: apiUser.createdAt
        ? new Date(apiUser.createdAt).getTime()
        : Date.now()
    };

    // Remove demo users and keep only this MongoDB account.
    Store.db.users = [user];

    // Remove demo content from the local frontend database.
    Store.db.posts = [];
    Store.db.notifications = [];
    Store.db.conversations = [];
    Store.db.queue = [];

    Store.save();
    Store.setSession(id, remember);

    return user;
  }
  /* ---------- Authentication model ---------- */

  const Auth = {
    Rules,
    AVATARS,

    current: () => Store.me(),

    async login(username, password, remember) {
      try {
        const data = await apiRequest('login', {
          username: username.trim().toLowerCase(),
          password
        });

        if (!data.token || !data.user) {
          throw new Error('Invalid response received from server.');
        }

        // Store the authentication token, never the password.
        localStorage.setItem('sans_token', data.token);

        const user = syncUser(data.user, remember);

        return {
          ok: true,
          user
        };

      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    },

    async register({ name, username, password, avatar }) {
      try {
        const data = await apiRequest('register', {
          name: name.trim(),
          username: username.trim().toLowerCase(),
          password,
          avatar
        });

        if (!data.token || !data.user) {
          throw new Error('Invalid response received from server.');
        }

        localStorage.setItem('sans_token', data.token);

        const user = syncUser(data.user, true);

        return {
          ok: true,
          user
        };

      } catch (error) {
        return {
          ok: false,
          error: error.message
        };
      }
    },

    async logout() {
      const ok = await UI.confirm({
        title: 'Log out of SANS?',
        message: 'You can log back in any time.',
        confirmText: 'Log out',
        danger: false,
        icon: 'fa-right-from-bracket'
      });

      if (!ok) return;

      localStorage.removeItem('sans_token');
      Store.clearSession();

      location.href = 'login.html?out=1';
    },

    safeNext(n) {
      return n && /^[a-z]+\.html(\?[\w=&.%-]*)?$/i.test(n)
        ? n
        : 'index.html';
    }
  };

  window.SANS.Auth = Auth;

  /* ---------- Field helpers ---------- */

  function setError(input, msg) {
    const field = input.closest('.field');

    if (!field) return !msg;

    field.classList.toggle('has-error', !!msg);

    let error = field.querySelector('.field__error');

    if (!error) {
      error = document.createElement('div');
      error.className = 'field__error';
      error.setAttribute('role', 'alert');
      field.appendChild(error);
    }

    error.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');

    return !msg;
  }

  function wireToggle(btn) {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');

      const show = input.type === 'password';

      input.type = show ? 'text' : 'password';

      btn.innerHTML = `<i class="fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'
        }"></i>`;

      btn.setAttribute(
        'aria-label',
        show ? 'Hide password' : 'Show password'
      );
    });
  }

  window.SANS.formUtils = {
    setError,
    wireToggle
  };

  /* ======================================================================
     Login page
     ====================================================================== */

  window.SANS.pages.login = {
    init() {
      const form = Utils.qs('#loginForm');
      const err = Utils.qs('#formError');

      Utils.qsa('[data-toggle-pw]').forEach(wireToggle);

      if (Utils.param('out')) {
        setTimeout(
          () => UI.toast('You have been logged out.', 'success'),
          200
        );
      }

      const showErr = (message) => {
        err.textContent = message;
        err.classList.toggle('hidden', !message);
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        showErr('');

        const username = form.username;
        const password = form.password;

        const okU = setError(
          username,
          username.value.trim() ? '' : 'Enter your username.'
        );

        const okP = setError(
          password,
          password.value ? '' : 'Enter your password.'
        );

        if (!okU || !okP) return;

        const btn = form.querySelector('button[type=submit]');

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Logging in';

        const result = await Auth.login(
          username.value,
          password.value,
          form.remember.checked
        );

        if (!result.ok) {
          btn.disabled = false;
          btn.textContent = 'Log in';
          showErr(result.error);
          return;
        }

        location.href = Auth.safeNext(
          Utils.param('next')
        );
      });

      ['username', 'password'].forEach(name => {
        form[name].addEventListener('input', () => {
          setError(form[name], '');
          showErr('');
        });
      });
    }
  };

  /* ======================================================================
     Signup page
     ====================================================================== */

  window.SANS.pages.signup = {
    init() {
      const form = Utils.qs('#signupForm');
      const picker = Utils.qs('#avatarPicker');

      let avatar = Utils.pick(AVATARS);
      let custom = null;

      Utils.qsa('[data-toggle-pw]').forEach(wireToggle);

      /* Avatar picker */

      const drawPicker = () => {
        picker.innerHTML =
          AVATARS.map(a => `
                        <button
                            type="button"
                            class="${a === avatar ? 'is-selected' : ''}"
                            data-av="${a}"
                            aria-label="Choose avatar">
                            <img src="${a}" alt="">
                        </button>
                    `).join('') +

          (custom ? `
                        <button
                            type="button"
                            class="${custom === avatar ? 'is-selected' : ''}"
                            data-av="custom"
                            aria-label="Your photo">
                            <img src="${custom}" alt="">
                        </button>
                    ` : '') +

          `
                        <button
                            type="button"
                            class="upload"
                            data-upload
                            aria-label="Upload a photo">
                            <i class="fa-solid fa-camera"></i>
                        </button>
                    `;
      };

      drawPicker();

      picker.addEventListener('click', (e) => {
        const button = e.target.closest('button');

        if (!button) return;

        if (button.dataset.upload !== undefined) {
          return Utils.qs('#avatarFile').click();
        }

        avatar = button.dataset.av === 'custom'
          ? custom
          : button.dataset.av;

        drawPicker();
      });

      Utils.qs('#avatarFile').addEventListener(
        'change',
        async (e) => {
          const file = e.target.files[0];

          if (!file) return;

          try {
            custom = await Utils.readImage(file, 256);
            avatar = custom;
            drawPicker();
          } catch (error) {
            UI.toast(error.message, 'error');
          }

          e.target.value = '';
        }
      );

      /* Form validation */

      const checks = {
        name: () => setError(
          form.name,
          Rules.name(form.name.value)
        ),

        username: () => setError(
          form.username,
          Rules.username(form.username.value.trim())
        ),

        password: () => setError(
          form.password,
          Rules.password(form.password.value)
        ),

        confirm: () => setError(
          form.confirm,
          form.confirm.value !== form.password.value
            ? 'Passwords do not match.'
            : form.confirm.value
              ? ''
              : 'Confirm your password.'
        )
      };

      Object.keys(checks).forEach(key => {
        form[key].addEventListener('blur', checks[key]);

        form[key].addEventListener('input', () => {
          if (
            form[key].closest('.field').classList.contains('has-error')
          ) {
            checks[key]();
          }
        });
      });

      const bar = Utils.qs('#strength');

      form.password.addEventListener('input', () => {
        bar.dataset.level = Rules.strength(
          form.password.value
        );
      });

      /* Submit registration */

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const valid = Object.values(checks)
          .map(check => check())
          .every(Boolean);

        if (!valid) {
          const bad = form.querySelector('.has-error input');
          if (bad) bad.focus();
          return;
        }

        const btn = form.querySelector('button[type=submit]');

        btn.disabled = true;
        btn.innerHTML =
          '<span class="spinner"></span> Creating account';

        const result = await Auth.register({
          name: form.name.value,
          username: form.username.value.trim(),
          password: form.password.value,
          avatar
        });

        if (!result.ok) {
          btn.disabled = false;
          btn.textContent = 'Create account';

          if (
            result.error.toLowerCase().includes('username') ||
            result.error.toLowerCase().includes('already')
          ) {
            setError(form.username, result.error);
          } else {
            UI.toast(result.error, 'error');
          }

          return;
        }

        location.href = 'index.html?welcome=1';
      });
    }
  };

})();
