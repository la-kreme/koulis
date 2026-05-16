// src/index.ts — Default entry point (HTTP transport)
import { startHttpServer } from "./transports/http.js";

const port = Number(process.env.PORT ?? 3000);
startHttpServer({ port });
