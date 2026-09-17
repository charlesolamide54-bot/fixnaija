require("dotenv").config();
const express = require("express");
const path = require("path");
const multer = require("multer");
const { Pool } = require("pg");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const upload = multer({
    dest: "uploads/"
});
const JWT_SECRET = process.env.JWT_SECRET;
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];

    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Access token required"
        });
    }

    jwt.verify(token, JWT_SECRET, (error, user) => {
        if (error) {
            return res.status(403).json({
                message: "Invalid or expired token"
            });
        }

        req.user = user;

        next();
    });
}

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: "localhost",
            database: "fixnaija",
            port: 5432
        }
);

app.get("/", (req, res) => {
    res.json({
        message: "FixNaija API is running"
    });
});

app.get("/api/test", (req, res) => {
    res.json({
        message: "New route is working"
    });
});

app.post("/api/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, role",
            [username, hashedPassword]
        );

        res.status(201).json({
            message: "Registration successful",
            user: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "Username already exists"
            });
        }

        res.status(500).json({
            message: "Registration failed"
        });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

	const result = await pool.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid username or password"
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid username or password"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role
            },
            JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

	res.json({
    message: "Login successful",
    token: token,
    user: {
        id: user.id,
        username: user.username,
        role: user.role
    }
});

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Login failed"
        });
    }
});

app.get("/api/reports", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM reports");

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch reports"
        });
    }
});

app.get("/api/my-reports", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM reports WHERE user_id = $1 ORDER BY id DESC",
            [req.user.id]
        );

        res.json(result.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch your reports"
        });
    }
});

app.get("/api/reports/:id", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM reports WHERE id = $1",
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Report not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch report"
        });
    }
});

app.get("/api/reports/:id/comments", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT report_comments.id,
                    report_comments.comment,
                    report_comments.created_at,
                    users.username
             FROM report_comments
             JOIN users ON report_comments.user_id = users.id
             WHERE report_comments.report_id = $1
             ORDER BY report_comments.created_at ASC`,
            [id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/api/reports/:id/comments", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const userId = req.user.id;

        if (!comment || !comment.trim()) {
            return res.status(400).json({
                message: "Comment cannot be empty"
            });
        }

        const result = await pool.query(
            `INSERT INTO report_comments (report_id, user_id, comment)
             VALUES ($1, $2, $3)
             RETURNING id, report_id, user_id, comment, created_at`,
            [id, userId, comment.trim()]
        );

        res.status(201).json({
            message: "Comment posted successfully",
            comment: result.rows[0]
        });

    } catch (error) {
        console.error("Comment error:", error);
        res.status(500).json({
            message: "Failed to post comment"
        });
    }
});

app.post("/api/reports/:id/upvote", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await pool.query(
            `INSERT INTO report_upvotes (report_id, user_id)
             VALUES ($1, $2)`,
            [id, userId]
        );

        res.status(201).json({
            message: "Report upvoted successfully"
        });

    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({
                message: "You have already upvoted this report"
            });
        }

        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.get("/api/reports/:id/history", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM report_status_history WHERE report_id = $1 ORDER BY changed_at ASC",
            [req.params.id]
        );

        res.json(result.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch status history"
        });
    }
});

app.post("/api/reports", authenticateToken, upload.single("image"), async (req, res) => {
    try {
	const {
    title,
    description,
    category,
    location,
    status,
    latitude,
    longitude
} = req.body;
	const imageUrl = req.file
    ? `/uploads/${req.file.filename}`
    : null;

const userId = req.user.id;
        const result = await pool.query(
"INSERT INTO reports (title, description, category, location, status, user_id, image_url, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
[title, description, category, location, status || "Reported", userId, imageUrl, latitude || null, longitude || null]
);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to create report"
        });
    }
});

app.put("/api/reports/:id", authenticateToken, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            message: "Admin access required"
        });
    }
    try {
        const { status } = req.body;

        const result = await pool.query(
            "UPDATE reports SET status = $1 WHERE id = $2 RETURNING *",
            [status, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Report not found"
            });
        }

await pool.query(
    "INSERT INTO report_status_history (report_id, status) VALUES ($1, $2)",
    [req.params.id, status]
);

if (result.rows[0].user_id) {
    await pool.query(
        `INSERT INTO notifications (user_id, report_id, message)
         VALUES ($1, $2, $3)`,
        [
            result.rows[0].user_id,
            result.rows[0].id,
            `Your report "${result.rows[0].title}" has been updated to ${status}.`
        ]
    );
}

res.json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update report"
        });
    }
});

app.delete("/api/reports/:id", authenticateToken, async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            message: "Admin access required"
        });
    }

    try {
        const result = await pool.query(
            "DELETE FROM reports WHERE id = $1 RETURNING *",
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Report not found"
            });
        }

        res.json({
            message: "Report deleted successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to delete report"
        });
    }
});

app.get("/api/reports/:id/upvotes", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT COUNT(*) AS count
             FROM report_upvotes
             WHERE report_id = $1`,
            [id]
        );

        res.json({
            count: Number(result.rows[0].count)
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.get("/api/reports/:id/upvoted", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT 1
             FROM report_upvotes
             WHERE report_id = $1 AND user_id = $2`,
            [id, userId]
        );

        res.json({
            upvoted: result.rows.length > 0
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.get("/api/notifications", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT *
             FROM notifications
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to load notifications"
        });
    }
});

app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
    try {
        await pool.query(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );

        res.json({
            message: "Notification marked as read"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to mark notification as read"
        });
    }
});

app.get("/api/notifications/unread-count", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT COUNT(*) 
             FROM notifications
             WHERE user_id = $1 AND is_read = FALSE`,
            [req.user.id]
        );

        res.json({
            count: Number(result.rows[0].count)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to get unread notification count"
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`FixNaija server running on port ${PORT}`);
});
