"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = metricsRoutes;
const metrics_1 = require("../core/metrics");
async function metricsRoutes(app, opts) {
    app.get('/', async () => {
        return metrics_1.globalStats;
    });
}
