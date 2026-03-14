import { expandEventLevelOne } from '../src/services/event-expand.service';

async function run() {
  // Use the same event ID that had duplicated text
  const eventId = 'e3557b70-c039-4270-89ad-650bb5de1d6f';
  
  console.log('Testing expandEventLevelOne with Structured Outputs...');
  
  // To force a fresh regeneration, we need to pass a different language or temporarily delete the old detail.
  // For safety, let's just query the function directly by faking a different language, 
  // or we can remove the existing record first.
  
  // Since we don't want to mess up the DB too much, let's request 'fr' (French) to force a cache miss and trigger AI.
  const result = await expandEventLevelOne(eventId, 'fr');
  
  console.log('--- OUTPUT FROM AI ---');
  console.log(JSON.stringify(result, null, 2));
}

run().catch(console.error);
