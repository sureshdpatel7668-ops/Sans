
require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const postRoutes = require("./routes/postRoutes");
const messageRoutes = require("./routes/messageRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

// Middleware
app.use(express.json({ limit: "6mb" }));

app.use(express.urlencoded({
    extended: true,
    limit: "6mb"
}));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/user", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);

// API Status
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "SANS API is running"
    });
});

// Frontend files
app.use(express.static(__dirname));

// Start Server
const startServer = async () => {
    try {
        await connectDB();

        app.listen(process.env.PORT || 5000, () => {
            console.log(
                `SANS Server running on port ${process.env.PORT || 5000}`
            );
        });

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
