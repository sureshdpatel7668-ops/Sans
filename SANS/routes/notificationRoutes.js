
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    getNotifications,
    markAllAsRead,
    markAsRead
} = require("../controllers/notificationController");

// Get all notifications
router.get("/", authMiddleware, getNotifications);

// Mark all notifications as read
router.patch("/read-all", authMiddleware, markAllAsRead);

// Mark one notification as read
router.patch("/:id/read", authMiddleware, markAsRead);

module.exports = router;
