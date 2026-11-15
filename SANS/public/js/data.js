
/* ==========================================================================
   data.js — empty local database structure.

   Demo seed users, posts, stories, notifications and conversations removed.
   Real application data is loaded from MongoDB.
   ========================================================================== */

(function () {
  'use strict';

  /**
   * Demo credentials disabled.
   * Empty values are retained for compatibility with older frontend code.
   */
  const DEMO = {
    username: '',
    password: ''
  };

  /**
   * Legacy hash helper retained for compatibility.
   * This is NOT used for real password security.
   */
  function hash(str) {
    let h = 5381;

    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }

    return 'h' + (h >>> 0).toString(36);
  }

  /**
   * Create an empty local database.
   *
   * MongoDB is the source of truth for:
   * - Users
   * - Posts
   * - Notifications
   * - Conversations
   *
   * Stories will remain empty until their MongoDB API is implemented.
   */
  function create() {
    const now = Date.now();

    return {
      version: 1,

      users: [],

      posts: [],

      stories: [],

      notifications: [],

      conversations: [],

      queue: [],

      createdAt: now
    };
  }

  // Preserve the existing global API.
  window.SANS_DATA = {
    create,
    hash,
    DEMO
  };

})();
