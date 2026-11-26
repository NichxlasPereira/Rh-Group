import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // O proxy (Basic Auth) guarda o corpo da requisição em memória e, por
    // padrão, corta em 10MB — o limite de anexo de atestado é 10MB por
    // arquivo, então deixamos folga para o envelope multipart.
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
