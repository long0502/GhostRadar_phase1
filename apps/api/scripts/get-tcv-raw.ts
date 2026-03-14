import { prisma } from '../src/db/prisma';
import { expandEventLevelOne } from '../src/services/event-expand.service';
import * as fs from 'fs';

async function run() {
  console.log('Đang tìm kiếm sự kiện "Bóng Dáng Thảo Cầm Viên"...');
  
  // Lấy tất cả events để tìm kiếm trong JSON gốc
  const events = await prisma.events.findMany();
  const targetEvent = events.find(e => {
    const data = e.event_data as any;
    return data && data.title && (data.title.includes('Thảo Cầm Viên') || data.title.toLowerCase().includes('thảo cầm viên'));
  });

  if (!targetEvent) {
    console.log('Không tìm thấy sự kiện nào chứa "Thảo Cầm Viên"!');
    return;
  }

  console.log(`Đã tìm thấy sự kiện: ID = ${targetEvent.id}`);

  let detail = await prisma.event_details.findFirst({
    where: { event_id: targetEvent.id, lang: 'vi', level: 1 },
    orderBy: { created_at: 'desc' },
  });

  if (!detail) {
    console.log('Chưa có dữ liệu chi tiết. Đang kích hoạt AI (Gemini) để tạo sinh mới với Structured Schema...');
    await expandEventLevelOne(targetEvent.id, 'vi');
    
    // Đọc lại từ DB sau khi tạo sinh
    detail = await prisma.event_details.findFirst({
      where: { event_id: targetEvent.id, lang: 'vi', level: 1 },
      orderBy: { created_at: 'desc' },
    });
  } else {
    console.log('Đã có sẵn dữ liệu chi tiết trong Database (có thể bạn đã bấm xem trên trình duyệt).');
  }

  if (detail) {
    const filePath = 'tcv_raw_new.log';
    fs.writeFileSync(filePath, JSON.stringify(detail, null, 2), 'utf-8');
    console.log(`Hoàn tất! Đã lưu toàn bộ RAW Json của event vào file: ${filePath}`);
    
    // In ra màn hình phần đầu để preview:
    console.log('\n--- BẢN XEM TRƯỚC (Preview Story Text) ---');
    console.log(detail.story_text.substring(0, 300) + '...\n-------------------------------------------');
  } else {
    console.log('Đã có lỗi xảy ra, không tìm thấy detail sau khi chạy hàm expand.');
  }
}

run().catch(console.error).finally(async () => {
    await prisma.$disconnect()
});
