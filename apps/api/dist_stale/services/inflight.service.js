"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withInflight = withInflight;
const inflightEntries = new Map();
function withInflight(key, ttlMs, factory) {
    const existing = inflightEntries.get(key);
    if (existing) {
        return existing.promise;
    }
    let promise;
    const timer = setTimeout(() => {
        const current = inflightEntries.get(key);
        if (current?.promise === promise) {
            inflightEntries.delete(key);
        }
    }, ttlMs);
    timer.unref?.();
    promise = (async () => factory())().finally(() => {
        const current = inflightEntries.get(key);
        if (current?.promise === promise) {
            clearTimeout(timer);
            inflightEntries.delete(key);
        }
    });
    inflightEntries.set(key, { promise, timer });
    return promise;
}
