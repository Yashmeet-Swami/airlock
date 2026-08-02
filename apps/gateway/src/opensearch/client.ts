import { Client } from "@opensearch-project/opensearch";
import { env } from "../config/env.js";

export const openSearchClient = new Client({ node: env.OPENSEARCH_URL });
