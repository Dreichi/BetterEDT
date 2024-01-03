/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/.*"],
  tailwind: true,
  postcss: true,
  appDirectory: "app",
  assetsBuildDirectory: "public/build",
  publicPath: "/build/",
  serverBuildPath: "build/index.js",

  browserNodeBuiltinsPolyfill: {
    modules: {
      child_process: "true",
      buffer: "true",
      fs: "true", 
      tls: "true",
      punycode: "true",
      crypto: "empt",
      path: "true",
      net: "true",
      dns: "true",
      os: "true",
      http: "true",
      https: "true",
      stream: "true",
      zlib: "true",
      url: "true",
      util: "true",
      events: "true",
    },
    globals: {
      Buffer: true,
    },
  },
};
