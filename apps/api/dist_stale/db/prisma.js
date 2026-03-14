"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const dotenv_1 = require("dotenv");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const pg_1 = __importDefault(require("pg"));
const env_1 = require("../utils/env");
(0, dotenv_1.config)();
const { Pool } = pg_1.default;
const pool = new Pool({
    connectionString: (0, env_1.getDatabaseUrl)(),
});
const adapter = new adapter_pg_1.PrismaPg(pool);
exports.prisma = new client_1.PrismaClient({
    adapter,
});
