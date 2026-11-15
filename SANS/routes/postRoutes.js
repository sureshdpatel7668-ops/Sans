
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    createPost,
    getPosts,
    getUserPosts,
    toggleLike,
    addComment,
    deleteComment,
    deletePost
} = require("../controllers/postController");

// Get all posts
router.get("/", getPosts);

// Get posts of a particular user
router.get("/user/:userId", getUserPosts);

// Create a post
router.post("/", authMiddleware, createPost);

// Like / Unlike a post
router.put("/:id/like", authMiddleware, toggleLike);

// Add a comment
router.post("/:id/comments", authMiddleware, addComment);

// Delete a comment
router.delete("/:id/comments/:commentId", authMiddleware, deleteComment);

// Delete a post
router.delete("/:id", authMiddleware, deletePost);

module.exports = router;
