import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext 0.0.50 checks multipart POSTs against the Server Action transport
  // ceiling before dispatching App Route Handlers. Allow a 20 MiB C10 file
  // plus its bounded multipart envelope; C10 still enforces 20 MiB of bytes.
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default nextConfig;
