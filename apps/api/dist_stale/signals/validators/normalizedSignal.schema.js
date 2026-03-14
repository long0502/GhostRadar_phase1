"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizedSignalArraySchema = exports.normalizedSignalSchema = void 0;
const zod_1 = require("zod");
exports.normalizedSignalSchema = zod_1.z.object({
    title: zod_1.z.string(),
    summary: zod_1.z.string(),
    lat: zod_1.z.number(),
    lon: zod_1.z.number(),
    event_type: zod_1.z.string(),
    event_source: zod_1.z.string(),
    confidence: zod_1.z.number().min(0).max(1),
});
exports.normalizedSignalArraySchema = zod_1.z.array(exports.normalizedSignalSchema);
