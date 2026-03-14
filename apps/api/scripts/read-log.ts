import fs from 'fs';
import path from 'path';

const logPath = path.join(__dirname, '../verification_result.log');
if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    console.log(content);
} else {
    console.error('Log file not found:', logPath);
}
