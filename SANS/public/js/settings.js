/* ==========================================================================
   settings.js — account, appearance, notifications, password, data export /
   reset and account deletion.
   ========================================================================== */
(function () {
  'use strict';
  const { Utils, Store, UI, Theme } = window.SANS;

  window.SANS.pages.settings = {
    init() {
      const me = Store.me(), root = Utils.qs('#settingsRoot');
      const { setError, wireToggle } = window.SANS.formUtils, Rules = window.SANS.Auth.Rules;

      const draw = () => {
        const theme = Theme.get(), reduced = Theme.motion() === 'reduced';
        root.innerHTML = `
        <section class="card set-section"><h2>Account</h2><p>How you appear to other people on SANS.</p>
          <div class="user-row" style="padding-top:0"><img class="avatar avatar--lg" src="${Utils.esc(me.avatar)}" alt=""><div class="user-row__meta"><span class="user-row__name">${Utils.esc(me.name)}</span><span class="user-row__sub">@${Utils.esc(me.username)}</span></div>
          <button class="btn btn--ghost btn--sm" id="editProfile">Edit profile</button></div></section>

        <section class="card set-section"><h2>Appearance</h2><p>Dark is the default. Switch any time.</p>
          <div class="set-row"><div><b>Theme</b><span class="muted">Applies to all SANS pages on this device.</span></div>
            <div class="seg" role="group" aria-label="Theme"><button data-theme="dark" class="${theme === 'dark' ? 'is-active' : ''}"><i class="fa-solid fa-moon"></i> Dark</button><button data-theme="light" class="${theme === 'light' ? 'is-active' : ''}"><i class="fa-solid fa-sun"></i> Light</button></div></div>
          <div class="set-row"><div><b>Reduce motion</b><span class="muted">Turns off most animations and transitions.</span></div><label class="switch"><input type="checkbox" id="motion" ${reduced ? 'checked' : ''} aria-label="Reduce motion"><span></span></label></div></section>

        <section class="card set-section"><h2>Notifications</h2><p>Choose how SANS tells you about activity.</p>
          <div class="set-row"><div><b>Activity pop-ups</b><span class="muted">Show a toast when someone likes, comments, follows or messages you.</span></div><label class="switch"><input type="checkbox" id="toasts" ${me.settings.toasts ? 'checked' : ''} aria-label="Activity pop-ups"><span></span></label></div>
          <div class="set-row"><div><b>Mark all as read</b><span class="muted">${Store.unreadNotifs(me.id)} unread notifications.</span></div><button class="btn btn--ghost btn--sm" id="readAll">Mark all read</button></div></section>

        <section class="card set-section"><h2>Password</h2><p>Use at least 8 characters with a letter and a number.</p>
          <form id="pwForm" novalidate>
            <div class="field"><label for="pwCur">Current password</label><div class="input-wrap"><input class="input" id="pwCur" name="cur" type="password" autocomplete="current-password"><button type="button" class="icon-btn" data-toggle-pw aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div></div>
            <div class="field"><label for="pwNew">New password</label><div class="input-wrap"><input class="input" id="pwNew" name="next" type="password" autocomplete="new-password"><button type="button" class="icon-btn" data-toggle-pw aria-label="Show password"><i class="fa-solid fa-eye"></i></button></div></div>
            <button class="btn btn--primary" type="submit">Update password</button></form></section>

        <section class="card set-section"><h2>Your data</h2><p>Everything is stored in this browser.</p>
          <div class="set-row"><div><b>Export my data</b><span class="muted">Download your profile, posts and messages as JSON.</span></div><button class="btn btn--ghost btn--sm" id="export">Download</button></div>
          <div class="set-row"><div><b>Reset demo data</b><span class="muted">Restore all demo users and posts. This signs you out.</span></div><button class="btn btn--ghost btn--sm" id="reset">Reset</button></div></section>

        <section class="card set-section set-danger"><h2>Session and account</h2><p>Log out or permanently delete your account.</p>
          <div class="set-row"><div><b>Log out</b><span class="muted">End your session on this device.</span></div><button class="btn btn--ghost btn--sm" id="logout">Log out</button></div>
          <div class="set-row"><div><b>Delete account</b><span class="muted">Removes your profile, posts, comments and messages.</span></div><button class="btn btn--danger btn--sm" id="delete">Delete account</button></div></section>`;
        bind();
      };

      const bind = () => {
        const $ = (s) => root.querySelector(s);
        root.querySelectorAll('[data-toggle-pw]').forEach(wireToggle);
        $('#editProfile').onclick = () => window.SANS.profileEdit(me, () => { draw(); window.SANS.Nav.render(); });
        root.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { Theme.set(b.dataset.theme); draw(); UI.toast(`${b.dataset.theme === 'dark' ? 'Dark' : 'Light'} theme on.`, 'success'); });
        $('#motion').onchange = (e) => { Theme.setMotion(e.target.checked ? 'reduced' : 'full'); UI.toast(e.target.checked ? 'Motion reduced.' : 'Motion restored.', 'success'); };
        $('#toasts').onchange = (e) => { me.settings.toasts = e.target.checked; Store.save(); UI.toast(e.target.checked ? 'Activity pop-ups on.' : 'Activity pop-ups off.', 'success'); };
        $('#readAll').onclick = () => { Store.db.notifications.forEach(n => { if (n.to === me.id) n.read = true; }); Store.save(); window.SANS.Nav.updateBadges(); draw(); UI.toast('All notifications marked as read.', 'success'); };

        $('#pwForm').onsubmit = (e) => {
          e.preventDefault(); const f = e.target;
          const okC = setError(f.cur, me.password === SANS_DATA.hash(f.cur.value + me.id) ? '' : 'Current password is incorrect.');
          const okN = setError(f.next, Rules.password(f.next.value) || (f.next.value === f.cur.value ? 'Choose a password you have not used here.' : ''));
          if (!okC || !okN) return;
          me.password = SANS_DATA.hash(f.next.value + me.id); Store.save(); f.reset(); UI.toast('Password updated.', 'success');
        };

        $('#export').onclick = () => {
          const mine = { exportedAt: new Date().toISOString(), profile: { ...me, password: undefined }, posts: Store.postsBy(me.id), conversations: Store.db.conversations.filter(c => c.members.includes(me.id)), notifications: Store.db.notifications.filter(n => n.to === me.id) };
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' }));
          a.download = `sans-${me.username}-data.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          UI.toast('Your data was downloaded.', 'success');
        };
        $('#reset').onclick = async () => {
          if (!await UI.confirm({ title: 'Reset all demo data?', message: 'Every account, post and message you created is erased and the original demo content comes back.', confirmText: 'Reset data', icon: 'fa-rotate-left' })) return;
          Store.clearSession(); Store.reset(); location.href = 'login.html';
        };
        $('#logout').onclick = () => window.SANS.Auth.logout();
        $('#delete').onclick = async () => {
          if (!await UI.confirm({ title: 'Delete your account?', message: 'Your profile, posts, comments, followers and messages are removed permanently.', confirmText: 'Delete account' })) return;
          const db = Store.db, id = me.id;
          db.users = db.users.filter(u => u.id !== id); db.users.forEach(u => { u.following = u.following.filter(x => x !== id); });
          db.posts = db.posts.filter(p => p.userId !== id); db.posts.forEach(p => { p.likes = p.likes.filter(x => x !== id); p.comments = p.comments.filter(c => c.userId !== id); });
          db.stories = db.stories.filter(s => s.userId !== id);
          db.notifications = db.notifications.filter(n => n.to !== id && n.from !== id);
          db.conversations = db.conversations.filter(c => !c.members.includes(id)); db.queue = db.queue.filter(q => q.forUser !== id);
          Store.save(); Store.clearSession(); location.href = 'login.html?out=1';
        };
      };
      draw();
    }
  };
})();
