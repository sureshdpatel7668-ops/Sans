
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 40
        },

        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            minlength: 3,
            maxlength: 20,
            match: /^[a-zA-Z0-9._]+$/
        },

        password: {
            type: String,
            required: true,
            select: false
        },

        avatar: {
            type: String,
            default: "assets/images/avatars/av1.svg"
        },

        bio: {
            type: String,
            default: "New to SANS.",
            maxlength: 160
        },

        verified: {
            type: Boolean,
            default: false
        },

        following: {
            type: [String],
            default: []
        },

        seenStories: {
            type: [String],
            default: []
        },

        settings: {
            toasts: {
                type: Boolean,
                default: true
            },

            emailDigest: {
                type: Boolean,
                default: false
            },

            privateProfile: {
                type: Boolean,
                default: false
            }
        }
    },
    {
        timestamps: true
    }
);

const User =
    mongoose.models.User || mongoose.model("User", userSchema);

module.exports = User;
