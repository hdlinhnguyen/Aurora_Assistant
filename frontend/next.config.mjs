import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // Cho phép truy cập dev server từ thiết bị khác trong mạng LAN (điện thoại demo, máy đồng đội)
  allowedDevOrigins: ["192.168.1.10"],
};

export default nextConfig;
