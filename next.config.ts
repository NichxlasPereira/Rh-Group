import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacote de demonstração (scripts/demo/build.sh): servidor autocontido, sem node_modules inteiro.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  experimental: {
    // O proxy (Basic Auth) guarda o corpo da requisição em memória e, por
    // padrão, corta em 10MB — o limite de anexo de atestado é 10MB por
    // arquivo, então deixamos folga para o envelope multipart.
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
