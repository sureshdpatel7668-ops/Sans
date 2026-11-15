
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

// CREATE JWT TOKEN
const createToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

// REGISTER USER
exports.register = async (req, res) => {
    try {
        const {
            name,
            username,
            password,
            avatar
        } = req.body;

        if (!name || !username || !password) {
            return res.status(400).json({
                success: false,
                message: "All required fields must be filled."
            });
        }

        if (
            typeof name !== "string" ||
            typeof username !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid registration data."
            });
        }

        const cleanName = name.trim();
        const cleanUsername = username.trim().toLowerCase();

        if (cleanName.length < 2 || cleanName.length > 40) {
            return res.status(400).json({
                success: false,
                message: "Name must be 2-40 characters."
            });
        }

        if (!/^[a-zA-Z0-9._]{3,20}$/.test(cleanUsername)) {
            return res.status(400).json({
                success: false,
                message: "Invalid username."
            });
        }

        if (
            password.length < 8 ||
            !/[A-Za-z]/.test(password) ||
            !/[0-9]/.test(password)
        ) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters and contain a letter and number."
            });
        }

        const existingUser = await User.findOne({
            username: cleanUsername
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            name: cleanName,
            username: cleanUsername,
            password: hashedPassword,
            avatar: typeof avatar === "string" && avatar.trim()
                ? avatar.trim()
                : "assets/images/avatars/av1.svg"
        });

        const token = createToken(user._id);

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error("Register Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Username already exists."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Registration failed."
        });
    }
};


// LOGIN USER
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const user = await User.findOne({
            username: username.trim().toLowerCase()
        }).select("+password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        const passwordMatched = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatched) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        const token = createToken(user._id);

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
};
