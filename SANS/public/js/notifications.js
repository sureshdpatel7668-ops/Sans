
/* ==========================================================================
   notifications.js — MongoDB notifications, unread state, mark-as-read
   and filters.
   ========================================================================== */

(function () {
    'use strict';

    const { Utils, UI, Posts } = window.SANS;

    const API = "/api/notifications";

    const VERB = {
        like: "liked your post.",
        comment: "commented on your post.",
        follow: "started following you."
    };

    const ICON = {
        like: "fa-heart",
        comment: "fa-comment",
        follow: "fa-user-plus"
    };

    let notifications = [];

    function getToken() {
        return localStorage.getItem("sans_token");
    }

    async function apiRequest(url, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error("Please login to view notifications.");
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...(options.headers || {})
            }
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
            throw new Error(data.message || "Something went wrong.");
        }

        return data;
    }

    function itemHtml(n) {
        const user = n.sender;

        if (!user) return "";

        const post = n.post;
        const postId = post ? (post._id || post.id) : null;

        if (n.type !== "follow" && !post) return "";

        const username = user.username || "user";
        const avatar = user.avatar || "assets/images/avatars/av1.svg";

        const thumb = post && post.image
            ? `<img class="notif__thumb" src="${Utils.esc(post.image)}" alt="">`
            : "";

        const isUnread = !n.isRead;

        const message = n.type === "comment" && n.message
            ? `<span class="notif__quote">“${Utils.esc(n.message)}”</span>`
            : "";

        const time = n.createdAt
            ? Utils.timeAgo(new Date(n.createdAt).getTime())
            : "";

        return `
            <div class="notif ${isUnread ? "is-unread" : ""}"
                 data-id="${Utils.esc(n._id)}"
                 data-type="${Utils.esc(n.type)}"
                 data-post="${Utils.esc(postId || "")}"
                 data-username="${Utils.esc(username)}"
                 tabindex="0"
                 role="link">

                <div class="notif__icon">
                    <img
                        class="avatar"
                        style="width:48px;height:48px"
                        src="${Utils.esc(avatar)}"
                        alt=""
                    >

                    <span class="notif__type notif__type--${Utils.esc(n.type)}">
                        <i class="fa-solid ${ICON[n.type] || "fa-bell"}"></i>
                    </span>
                </div>

                <div class="notif__text">
                    <b>${Utils.esc(username)}</b>
                    ${VERB[n.type] || "sent you a notification."}
                    ${message}
                    <span class="notif__time">${Utils.esc(time)}</span>
                </div>

                ${n.type === "follow" ? "" : thumb}
            </div>
        `;
    }

    window.SANS.pages.notifications = {
        filter: "all",

        async init() {
            const self = this;
            const list = Utils.qs("#notifList");
            const markAllButton = Utils.qs("#markAll");
            const unreadCountElement = Utils.qs("#unreadCount");

            if (!list || !markAllButton || !unreadCountElement) {
                console.error("Notifications page elements not found.");
                return;
            }

            // Load notifications from MongoDB
            async function loadNotifications() {
                try {
                    const data = await apiRequest(API);

                    notifications = data.notifications || [];

                    draw();

                } catch (error) {
                    console.error("Load notifications error:", error);

                    list.innerHTML = UI.empty(
                        "fa-bell",
                        "Unable to load notifications",
                        error.message
                    );
                }
            }

            // Render notifications
            function draw() {
                const unread = notifications.filter(n => !n.isRead).length;

                const items = notifications.filter(n => {
                    if (self.filter === "unread") {
                        return !n.isRead;
                    }

                    return true;
                });

                markAllButton.disabled = unread === 0;

                unreadCountElement.textContent = unread
                    ? `${unread} unread`
                    : "All caught up";

                Utils.qsa("[data-filter]").forEach(tab => {
                    const active = tab.dataset.filter === self.filter;

                    tab.classList.toggle("is-active", active);
                    tab.setAttribute("aria-selected", String(active));
                });

                const html = items.map(itemHtml).join("");

                list.innerHTML = html
                    ? `<div class="card" style="overflow:hidden">${html}</div>`
                    : UI.empty(
                        "fa-bell",
                        self.filter === "unread"
                            ? "No unread notifications"
                            : "No notifications yet",
                        self.filter === "unread"
                            ? "You have read everything. Nice."
                            : "Likes, comments and new followers will show up here."
                    );

                if (window.SANS.Nav) {
                    window.SANS.Nav.updateBadges();
                }
            }

            // Loading skeleton
            list.innerHTML =
                '<div class="card" style="padding:16px">' +
                Array.from(
                    { length: 4 },
                    () => `
                        <div class="sk-row">
                            <div class="skeleton sk-circle"></div>
                            <div style="flex:1">
                                <div class="skeleton sk-line" style="width:70%"></div>
                                <div class="skeleton sk-line" style="width:30%;margin:0"></div>
                            </div>
                        </div>
                    `
                ).join("") +
                "</div>";

            // Filter buttons
            Utils.qsa("[data-filter]").forEach(tab => {
                tab.addEventListener("click", () => {
                    self.filter = tab.dataset.filter;
                    draw();
                });
            });

            // Mark all notifications as read
            markAllButton.addEventListener("click", async () => {
                try {
                    await apiRequest(`${API}/read-all`, {
                        method: "PATCH"
                    });

                    notifications.forEach(n => {
                        n.isRead = true;
                    });

                    draw();

                    UI.toast(
                        "All notifications marked as read.",
                        "success"
                    );

                } catch (error) {
                    console.error("Mark all notifications error:", error);
                    UI.toast(error.message, "error");
                }
            });

            // Open notification
            async function openNotification(element) {
                const notificationId = element.dataset.id;

                const notification = notifications.find(
                    n => String(n._id) === String(notificationId)
                );

                if (!notification) return;

                if (!notification.isRead) {
                    try {
                        await apiRequest(
                            `${API}/${notificationId}/read`,
                            { method: "PATCH" }
                        );

                        notification.isRead = true;

                        // Refresh notification list and navbar count
                        draw();

                    } catch (error) {
                        console.error("Mark notification read error:", error);
                        UI.toast(error.message, "error");
                    }
                }

                // Follow notification opens sender profile
                if (notification.type === "follow") {
                    const username = notification.sender?.username;

                    if (username) {
                        location.href =
                            `profile.html?u=${encodeURIComponent(username)}`;
                    }

                    return;
                }

                // Like/comment notification opens the related post
                const postId = notification.post?._id ||
                    notification.post?.id;

                if (postId && Posts) {
                    Posts.openPost(
                        String(postId),
                        {
                            comments: notification.type === "comment"
                        }
                    );
                }
            }

            // Click events
            list.addEventListener("click", event => {
                const element = event.target.closest(".notif");

                if (element) {
                    openNotification(element);
                }
            });

            // Keyboard events
            list.addEventListener("keydown", event => {
                if (
                    (event.key === "Enter" || event.key === " ") &&
                    event.target.classList.contains("notif")
                ) {
                    event.preventDefault();
                    openNotification(event.target);
                }
            });

            // Initial load
            await loadNotifications();
        }
    };
})();
