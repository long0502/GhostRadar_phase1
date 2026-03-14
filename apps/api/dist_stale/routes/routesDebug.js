"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = routesDebug;
async function routesDebug(app, opts) {
    app.get('/', async (_request, reply) => {
        reply.type('text/plain').send(app.printRoutes());
    });
}
