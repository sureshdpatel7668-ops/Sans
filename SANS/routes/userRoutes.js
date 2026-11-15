
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/user");
const Notification = require("../models/notification");
// --------------------------------------------------
// GET: Logged-in user's profile
// --------------------------------------------------

router.get("/me", authMiddleware, (req, res) => {
    res.status(200).json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            username: req.user.username,
            avatar: req.user.avatar,
            bio: req.user.bio,
            verified: req.user.verified,
            following: req.user.following,
            settings: req.user.settings,
            createdAt: req.user.createdAt
        }
    });
});

// --------------------------------------------------
// PUT: Update logged-in user's profile
// --------------------------------------------------

router.put("/me", authMiddleware, async (req, res) => {
    try {
        const { name, username, bio, avatar } = req.body;

        if (
            typeof name !== "string" ||
            typeof username !== "string" ||
            typeof bio !== "string" ||
            typeof avatar !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid profile details."
            });
        }

        const cleanName = name.trim();
        const cleanUsername = username.trim().toLowerCase();
        const cleanBio = bio.trim();

        if (cleanName.length < 2 || cleanName.length > 40) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 40 characters."
            });
        }

        if (!/^[a-z0-9._]{3,20}$/.test(cleanUsername)) {
            return res.status(400).json({
                success: false,
                message: "Username must be 3-20 characters and contain only letters, numbers, dots or underscores."
            });
        }

        if (cleanBio.length > 160) {
            return res.status(400).json({
                success: false,
                message: "Bio cannot exceed 160 characters."
            });
        }

        if (avatar.length > 500000) {
            return res.status(400).json({
                success: false,
                message: "Avatar data is too large."
            });
        }

        const existingUser = await User.findOne({
            username: cleanUsername,
            _id: { $ne: req.user._id }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This username is already taken."
            });
        }

        req.user.name = cleanName;
        req.user.username = cleanUsername;
        req.user.bio = cleanBio;
        req.user.avatar = avatar;

        await req.user.save();

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            user: {
                id: req.user._id,
                name: req.user.name,
                username: req.user.username,
                avatar: req.user.avatar,
                bio: req.user.bio,
                verified: req.user.verified,
                following: req.user.following,
                settings: req.user.settings,
                createdAt: req.user.createdAt
            }
        });

    } catch (error) {
        console.error("Profile update error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This username is already taken."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to update profile."
        });
    }
});

// GET: Discover registered MongoDB users
router.get("/discover", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user._id }
    })
      .select("name username avatar bio verified following createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json({
      success: true,
      users: users.map(user => ({
        id: String(user._id),
        name: user.name,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio || "",
        verified: Boolean(user.verified),
        following: (user.following || []).map(String),
        createdAt: user.createdAt
      }))
    });
  } catch (error) {
    console.error("Discover users error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load users."
    });
  }
});

// --------------------------------------------------
// POST: Follow / Unfollow user
// --------------------------------------------------

// --------------------------------------------------
// POST: Follow / Unfollow user + Notification
// --------------------------------------------------

router.post("/:userId/follow", authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        const currentUserId = String(req.user._id);
        const targetUserId = String(userId);

        if (currentUserId === targetUserId) {
            return res.status(400).json({
                success: false,
                message: "You cannot follow yourself."
            });
        }

        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const alreadyFollowing = (req.user.following || [])
            .some(id => String(id) === targetUserId);

        if (alreadyFollowing) {
            await User.updateOne(
                { _id: req.user._id },
                { $pull: { following: targetUserId } }
            );

            // Remove follow notification after unfollow
            try {
                await Notification.deleteMany({
                    recipient: targetUserId,
                    sender: req.user._id,
                    type: "follow"
                });
            } catch (notificationError) {
                console.error("Remove follow notification error:", notificationError);
            }

        } else {
            await User.updateOne(
                { _id: req.user._id },
                { $addToSet: { following: targetUserId } }
            );

            // Create notification after follow
            try {
                await Notification.create({
                    recipient: targetUserId,
                    sender: req.user._id,
                    type: "follow",
                    message: "started following you"
                });
            } catch (notificationError) {
                console.error("Create follow notification error:", notificationError);
            }
        }

        const updatedUser = await User.findById(req.user._id)
            .select("following");

        return res.status(200).json({
            success: true,
            following: !alreadyFollowing,
            followingCount: updatedUser.following.length,
            message: alreadyFollowing
                ? "User unfollowed successfully."
                : "User followed successfully."
        });

    } catch (error) {
        console.error("Follow error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update follow status."
        });
    }
});
// --------------------------------------------------
// GET: User's followers
// --------------------------------------------------

router.get("/:userId/followers", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        const user = await User.findById(userId).select("_id");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const followers = await User.find({
            following: userId
        }).select("name username avatar verified");

        return res.status(200).json({
            success: true,
            count: followers.length,
            followers
        });

    } catch (error) {
        console.error("Followers error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load followers."
        });
    }
});

// --------------------------------------------------
// GET: User's following
// --------------------------------------------------

router.get("/:userId/following", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        const user = await User.findById(userId)
            .select("following");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const following = await User.find({
            _id: { $in: user.following }
        }).select("name username avatar verified");

        return res.status(200).json({
            success: true,
            count: following.length,
            following
        });

    } catch (error) {
        console.error("Following error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load following list."
        });
    }
});

module.exports = router;
