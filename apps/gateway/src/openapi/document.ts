import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry.js";

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    title: "Airlock Admin & Proxy API",
    version: "0.1.0",
    description: "Phase 1: auth, tenants, routes, API keys, and the core proxy.",
  },
  servers: [{ url: "/" }],
});
