"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
async function healthRoutes(app, opts) {
    app.get('/', async () => {
        return { status: 'ok' };
    });
}
