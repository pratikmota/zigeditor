import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const exampleDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // pnpm links `next` into the workspace store. Turbopack must use the
  // lockfile root or it refuses to follow that symlink.
  turbopack: {
    root: path.resolve(exampleDir, "../.."),
  },
  agentRules: false,
};

export default nextConfig;
