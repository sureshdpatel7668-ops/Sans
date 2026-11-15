const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        text: {
            type: String,
            required: true,
            trim: true,
            maxlength: 300
        }
    },
    { timestamps: true }
);

const postSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        text: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },
        image: {
            type: String,
            default: ""
        },
        likes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }],
        comments: [commentSchema]
    },
    { timestamps: true }
);

module.exports =
    mongoose.models.Post || mongoose.model("Post", postSchema);