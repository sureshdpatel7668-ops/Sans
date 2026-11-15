
const mongoose = require("mongoose");
const Post = require("../models/post");
const Notification = require("../models/notification");
// CREATE POST
exports.createPost = async (req, res) => {
    try {
        const { text = "", image = "" } = req.body;

        if (typeof text !== "string" || typeof image !== "string") {
            return res.status(400).json({
                success: false,
                message: "Invalid post data."
            });
        }

        const cleanText = text.trim();

        if (cleanText.length > 500) {
            return res.status(400).json({
                success: false,
                message: "Post text cannot exceed 500 characters."
            });
        }

        if (!cleanText && !image) {
            return res.status(400).json({
                success: false,
                message: "A post must contain text or an image."
            });
        }

        if (image.length > 5000000) {
            return res.status(400).json({
                success: false,
                message: "Image is too large."
            });
        }

        const post = await Post.create({
            userId: req.user._id,
            text: cleanText,
            image
        });

        await post.populate("userId", "name username avatar verified");

        return res.status(201).json({
            success: true,
            message: "Post published successfully.",
            post
        });

    } catch (error) {
        console.error("Create post error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not publish post."
        });
    }
};


// GET ALL POSTS
exports.getPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .populate("userId", "name username avatar verified")
            .populate("comments.userId", "name username avatar")
            .sort({ createdAt: -1 })
            .limit(100);

        return res.status(200).json({
            success: true,
            count: posts.length,
            posts
        });

    } catch (error) {
        console.error("Get posts error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not load posts."
        });
    }
};


// GET POSTS OF A USER
exports.getUserPosts = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID."
            });
        }

        const posts = await Post.find({ userId })
            .populate("userId", "name username avatar verified")
            .populate("comments.userId", "name username avatar")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: posts.length,
            posts
        });

    } catch (error) {
        console.error("Get user posts error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not load user posts."
        });
    }
};


// LIKE / UNLIKE POST

exports.toggleLike = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID."
            });
        }

        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found."
            });
        }

        const userId = req.user._id;

        const alreadyLiked = post.likes.some(
            uid => uid.equals(userId)
        );

        if (alreadyLiked) {
            post.likes.pull(userId);

            await Notification.findOneAndDelete({
                recipient: post.userId,
                sender: userId,
                post: post._id,
                type: "like"
            });

        } else {
            post.likes.addToSet(userId);

            if (!post.userId.equals(userId)) {
                try {
                    await Notification.create({
                        recipient: post.userId,
                        sender: userId,
                        post: post._id,
                        type: "like",
                        message: "liked your post"
                    });
                } catch (notificationError) {
                    console.error(
                        "Like notification error:",
                        notificationError
                    );
                }
            }
        }

        await post.save();

        return res.status(200).json({
            success: true,
            liked: !alreadyLiked,
            likes: post.likes.length
        });

    } catch (error) {
        console.error("Like post error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not update like."
        });
    }
};


// ADD COMMENT

exports.addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID."
            });
        }

        if (typeof text !== "string" || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: "Comment cannot be empty."
            });
        }

        if (text.trim().length > 300) {
            return res.status(400).json({
                success: false,
                message: "Comment cannot exceed 300 characters."
            });
        }

        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found."
            });
        }

        post.comments.push({
            id: new mongoose.Types.ObjectId().toString(),
            userId: req.user._id,
            text: text.trim(),
            at: new Date()
        });

        await post.save();

        if (!post.userId.equals(req.user._id)) {
            try {
                await Notification.create({
                    recipient: post.userId,
                    sender: req.user._id,
                    post: post._id,
                    type: "comment",
                    message: text.trim()
                });
            } catch (notificationError) {
                console.error(
                    "Comment notification error:",
                    notificationError
                );
            }
        }

        await post.populate(
            "comments.userId",
            "name username avatar"
        );

        return res.status(201).json({
            success: true,
            message: "Comment added.",
            comments: post.comments
        });

    } catch (error) {
        console.error("Add comment error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not add comment."
        });
    }
};


// DELETE COMMENT
exports.deleteComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID."
            });
        }

        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found."
            });
        }

        const comment = post.comments.find(
            c => c.id === commentId
        );

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "Comment not found."
            });
        }

        const isCommentOwner = comment.userId.equals(req.user._id);
        const isPostOwner = post.userId.equals(req.user._id);

        if (!isCommentOwner && !isPostOwner) {
            return res.status(403).json({
                success: false,
                message: "You cannot delete this comment."
            });
        }

        post.comments = post.comments.filter(
            c => c.id !== commentId
        );

        await post.save();

        return res.status(200).json({
            success: true,
            message: "Comment deleted."
        });

    } catch (error) {
        console.error("Delete comment error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not delete comment."
        });
    }
};


// DELETE POST
exports.deletePost = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID."
            });
        }

        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found."
            });
        }

        if (!post.userId.equals(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own posts."
            });
        }

        await Post.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Post deleted successfully."
        });

    } catch (error) {
        console.error("Delete post error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not delete post."
        });
    }
};
