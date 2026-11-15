# SANS — Your people. Your space. Your world.

A social networking front end in plain HTML5, CSS3 and vanilla JavaScript. No frameworks, no build step.
All data lives in `localStorage`.

## Run it

Serve the folder with any static server and open `login.html`:

```bash
cd SANS
python3 -m http.server 8000     # or: npx serve .
# visit http://localhost:8000/login.html
```

Opening the files directly (file://) also works. Font Awesome and Google Fonts load from CDNs, so you need an internet connection for icons and fonts.

**Demo account:** click "Try the demo account", or log in as `demo` / `Demo@123`. Every seeded user shares the password `Demo@123`.

## Structure

```
index.html  login.html  signup.html  explore.html
profile.html  messages.html  notifications.html  settings.html
css/   style.css (design system + components)   responsive.css (tablet / mobile)
js/    data.js           seed users, posts, stories, messages
       app.js            Utils, Store (localStorage DB), UI (toast, modal, confirm, dropdown), simulated activity, route guard
       auth.js           register, login, logout, validation, login + signup pages
       navigation.js     sidebar, mobile top bar + bottom nav, badges, page transitions
       posts.js          post card, like, comment, share, delete, composer, post viewer
       feed.js           stories + story viewer, feed, single post view
       profile.js        profile, follow, edit profile, followers/following lists
       explore.js        search (people, posts, #tags), suggested, trending, popular
       notifications.js  likes / comments / follows, read state
       messages.js       conversations, chat, new message, simulated replies
       settings.js       theme, motion, notifications, password, export, reset, delete account
assets/ logo.svg, logo.png, images/avatars, images/posts
```

## Notes

- Passwords are lightly hashed for the demo only. Real authentication needs a server.
- After you post, follow someone or send a message, simulated users react a few seconds later (likes, comments, follow-backs, replies). These events are queued in storage, so they still arrive if you switch pages.
- Settings → "Reset demo data" restores the original content.
