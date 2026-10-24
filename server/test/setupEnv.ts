Object.assign(process.env, { NODE_ENV: "test" });
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters";
process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.DOCKER_ENABLED = "false";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:1/unused";
