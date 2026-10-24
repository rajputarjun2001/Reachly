import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "mongoose",
    "ioredis",
    "bullmq",
    "playwright",
    "dockerode",
    "bcryptjs",
  ],
};

export default nextConfig;
