export const publicRouteAllowlist = [
  {
    controllerKey: "auth.controller.ts#POST login",
    openApiPath: "/api/auth/login",
  },
  {
    controllerKey: "auth.controller.ts#POST refresh",
    openApiPath: "/api/auth/refresh",
  },
  {
    controllerKey: "auth.controller.ts#POST logout",
    openApiPath: "/api/auth/logout",
  },
  {
    controllerKey: "health.controller.ts#GET ",
    openApiPath: "/api/health",
  },
  {
    controllerKey: "bakai.controller.ts#POST webhooks",
    openApiPath: "/api/integrations/bakai/webhooks",
  },
];
