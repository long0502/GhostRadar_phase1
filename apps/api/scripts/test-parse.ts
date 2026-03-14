import data from '../debug2.json';

const story_text = data.detail.story_text;
console.log('--- RAW STORY_TEXT ---');
console.log(story_text.substring(0, 100) + '... (truncated)');

console.log('\n--- ATTEMPTING MATCH ---');
const jsonMatch = story_text.match(/\{[\s\S]*\}/);

if (jsonMatch) {
  console.log('Matched JSON portion length:', jsonMatch[0].length);
  try {
    const p = JSON.parse(jsonMatch[0]);
    console.log('--- PARSE SUCCESS ---');
    console.log('Extracted story_text:', p.story_text.substring(0, 100) + '...');
  } catch (err: any) {
    console.log('--- PARSE FAILED ---');
    console.error(err.message);
    
    // Try to fix escaping?
    try {
        const fixed = jsonMatch[0].replace(/\n/g, '\\n');
        const p2 = JSON.parse(fixed);
        console.log('--- PARSE SUCCESS AFTER NEWLINE FIX ---');
        console.log('Extracted story_text:', p2.story_text.substring(0, 100) + '...');
    } catch (err2: any) {
        console.log('--- PARSE FAILED AFTER FIX ---');
        console.error(err2.message);
    }
  }
} else {
  console.log('No match found');
}
