import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // Cho phép truy cập dev server từ thiết bị khác trong mạng LAN (điện thoại demo, máy đồng đội)
  // Thêm IP LAN hiện tại của máy chạy dev vào danh sách này khi đổi mạng/DHCP.
  allowedDevOrigins: ["192.168.1.10", "10.230.130.210"],
  async rewrites() {
    return [
      {
        source: "/api/hint",
        destination: "http://127.0.0.1:8089/api/hint", // Proxy to Python FastAPI service
      },
    ];
  },
};

export default nextConfig;
