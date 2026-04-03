import { callGemini } from './src/services/gemini.service';

async function main() {
  console.log('============================================');
  console.log('[TEST] Đang gửi request giả lập tới Gateway...');
  console.log('============================================');

  try {
    const res = await callGemini({
      endpoint: 'scan',
      prompt: 'Hãy trả về một mảng JSON chứa 3 sự kiện tâm linh hư cấu ở Hà Nội:\n[{"name", "type", "description", "latitude", "longitude", "severity"}]',
      aiCallsThisRequest: 1,
      systemInstruction: 'You are a raw data API. Return ONLY a JSON array, nothing else.',
    });
    console.log('\n[TEST THÀNH CÔNG] Dữ liệu trả về:');
    console.log(res);
  } catch (err) {
    console.error('\n[TEST THẤT BẠI] Đã xảy ra lỗi:');
    console.error(err);
  }
}

main();
