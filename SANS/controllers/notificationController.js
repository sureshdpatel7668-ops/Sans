
const mongoose = require("mongoose");
const Notification = require("../models/notification");

// GET: Logged-in user's notifications
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user._id;

        const notifications = await Notification.find({
            recipient: userId
        })
            .populate("sender", "name username avatar verified")
            .populate("post", "content image")
            .sort({ createdAt: -1 })
            .lean();

        const unreadCount = await Notification.countDocuments({
            recipient: userId,
            isRead: false
        });

        return res.status(200).json({
            success: true,
            count: notifications.length,
            unreadCount,
            notifications
        });

    } catch (error) {
        console.error("GET NOTIFICATIONS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load notifications"
        });
    }
};

// PATCH: Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            {
                recipient: req.user._id,
                isRead: false
            },
            {
                $set: { isRead: true }
            }
        );

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read"
        });

    } catch (error) {
        console.error("MARK NOTIFICATIONS READ ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update notifications"
        });
    }
};

// PATCH: Mark one notification as read
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID"
            });
        }

        const notification = await Notification.findOneAndUpdate(
            {
                _id: id,
                recipient: req.user._id
            },
            {
                $set: { isRead: true }
            },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }

        return res.status(200).json({
            success: true,
            notification
        });

    } catch (error) {
        console.error("MARK NOTIFICATION READ ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update notification"
        });
    }
};
