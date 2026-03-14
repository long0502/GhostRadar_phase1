"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventRepository = void 0;
const prisma_1 = require("../db/prisma");
class EventRepository {
    async createMany(events) {
        await prisma_1.prisma.events.createMany({ data: events });
    }
}
exports.EventRepository = EventRepository;
