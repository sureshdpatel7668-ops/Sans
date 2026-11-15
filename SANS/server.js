
require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");
const path = require("path");

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

// MongoDB connection
let dbConnectionPromise;

async function ensureDBConnection(req, res, next) {
    try {
        if (!dbConnectionPromise) {
            dbConnectionPromise = connectDB();
        }

        await dbConnectionPromise;
        next();

    } catch (error) {
        dbConnectionPromise = null;

        console.error("MongoDB connection failed:", error);

        return res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
}

// API Status
app.get("/api/status", (req, res) => {
    res.status(200).json({
        success: true,
        message: "SANS API is running"
    });
});

// API Routes
app.use("/api/auth", ensureDBConnection, authRoutes);
app.use("/api/posts", ensureDBConnection, postRoutes);
app.use("/api/user", ensureDBConnection, userRoutes);
app.use("/api/messages", ensureDBConnection, messageRoutes);
app.use("/api/notifications", ensureDBConnection, notificationRoutes);

// Frontend static files
app.use(express.static(__dirname));

// Homepage
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 404 handler
app.use((req, res) => {
    res.status(404).send("Page not found");
});

// Export app for Vercel
module.exports = app;

// Start local server
if (require.main === module) {
    const PORT = process.env.PORT || 5000;

    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`SANS Server running on port ${PORT}`);
            });
        })
        .catch((error) => {
            console.error("Server startup failed:", error.message);
            process.exit(1);
        });
}
