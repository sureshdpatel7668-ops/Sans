
const mongoose = require("mongoose");
const Conversation = require("../models/conversation");
const User = require("../models/user");

// GET: Logged-in user's conversations
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user._id;

        const conversations = await Conversation.find({
            members: userId
        })
            .populate("members", "name username avatar verified")
            .sort({ updatedAt: -1 })
            .lean();

        const result = conversations.map(conversation => {
            const lastMessage = conversation.messages.length
                ? conversation.messages[conversation.messages.length - 1]
                : null;

            const unreadCount = conversation.messages.filter(message =>
                message.sender.toString() !== userId.toString() &&
                !message.readBy.some(id => id.toString() === userId.toString())
            ).length;

            return {
                ...conversation,
                lastMessage,
                unreadCount
            };
        });

        res.status(200).json({
            success: true,
            count: result.length,
            conversations: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to load conversations",
            error: error.message
        });
    }
};

// POST: Create or get conversation
exports.createConversation = async (req, res) => {
    try {
        const currentUserId = req.user._id;
        const { userId } = req.body;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID"
            });
        }

        if (currentUserId.toString() === userId.toString()) {
            return res.status(400).json({
                success: false,
                message: "You cannot start a conversation with yourself"
            });
        }

        const targetUser = await User.findById(userId);

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        let conversation = await Conversation.findOne({
            members: {
                $all: [currentUserId, userId]
            },
            $expr: {
                $eq: [{ $size: "$members" }, 2]
            }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                members: [currentUserId, userId],
                messages: []
            });
        }

        conversation = await Conversation.findById(conversation._id)
            .populate("members", "name username avatar verified");

        res.status(200).json({
            success: true,
            conversation
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to create conversation",
            error: error.message
        });
    }
};

// GET: Conversation messages
exports.getMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation ID"
            });
        }

        const conversation = await Conversation.findOne({
            _id: id,
            members: userId
        })
            .populate("members", "name username avatar verified")
            .populate("messages.sender", "name username avatar");

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found"
            });
        }

        res.status(200).json({
            success: true,
            conversation
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to load messages",
            error: error.message
        });
    }
};

// POST: Send a message

exports.sendMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const text = typeof req.body.text === "string"
            ? req.body.text.trim()
            : "";

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation ID"
            });
        }

        if (!text || text.length > 2000) {
            return res.status(400).json({
                success: false,
                message: "Message must contain 1 to 2000 characters"
            });
        }

        const conversation = await Conversation.findOne({
            _id: id,
            members: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found"
            });
        }

        conversation.messages.push({
            sender: userId,
            text,
            readBy: [userId],
            createdAt: new Date()
        });

        conversation.updatedAt = new Date();

        await conversation.save();

        // Populate sender using the parent conversation document.
        const messageIndex = conversation.messages.length - 1;

        await conversation.populate(
            `messages.${messageIndex}.sender`,
            "name username avatar"
        );

        const savedMessage = conversation.messages[messageIndex];

        return res.status(201).json({
            success: true,
            message: savedMessage
        });

    } catch (error) {
        console.error("SEND MESSAGE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to send message",
            error: error.message
        });
    }
};


// PATCH: Mark incoming messages as read
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid conversation ID"
            });
        }

        const conversation = await Conversation.findOne({
            _id: id,
            members: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found"
            });
        }

        conversation.messages.forEach(message => {
            if (message.sender.toString() !== userId.toString()) {
                const alreadyRead = message.readBy.some(
                    readerId => readerId.toString() === userId.toString()
                );

                if (!alreadyRead) {
                    message.readBy.push(userId);
                }
            }
        });

        await conversation.save();

        res.status(200).json({
            success: true,
            message: "Messages marked as read"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to mark messages as read",
            error: error.message
        });
    }
};
