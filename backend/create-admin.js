const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    password: "postgres",
    host: "localhost",
    database: "fixnaija",
    port: 5432
});

async function createAdmin() {
    const username = "admin";
    const password = "ChangeThisPassword123";

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        [username, hashedPassword, "admin"]
    );

    console.log("Admin account created successfully.");

    await pool.end();
}

createAdmin();
