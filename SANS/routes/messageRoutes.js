
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    getConversations,
    createConversation,
    getMessages,
    sendMessage,
    markAsRead
} = require("../controllers/messageController");

// Get all conversations
router.get("/", authMiddleware, getConversations);

// Create or get a conversation
router.post("/", authMiddleware, createConversation);

// Mark messages as read
router.patch("/:id/read", authMiddleware, markAsRead);

// Get conversation messages
router.get("/:id", authMiddleware, getMessages);

// Send a message
router.post("/:id", authMiddleware, sendMessage);

module.exports = router;
