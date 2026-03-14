"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = versionRoutes;
async function versionRoutes(app, opts) {
    app.get('/', async () => {
        return { version: process.env.BUILD_VERSION || 'dev' };
    });
}
