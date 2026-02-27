import { prisma } from '../db/prisma';
import type { ScanEvent } from '../domain/event';

type PersistedEvent = {
  grid_id: string;
  event_type: string;
  event_data: ScanEvent;
};

export class EventRepository {
  async createMany(events: PersistedEvent[]): Promise<void> {
    await prisma.events.createMany({ data: events });
  }
}
