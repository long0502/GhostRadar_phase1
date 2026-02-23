# GHOST RADAR PRO – Phase 1

## System Overview
Hệ thống phát hiện và phân tích dị thường dựa trên vị trí địa lý, sử dụng AI và cơ sở dữ liệu giao dịch thời gian thực. Mục tiêu: đảm bảo hiệu năng, bảo mật, khả năng mở rộng và tuân thủ nghiêm ngặt các quy tắc kiến trúc thương mại.

## Architecture Boundaries
- Backend: Fastify (Node.js + TypeScript)
- ORM: Prisma
- Database: PostgreSQL (Docker)
- Frontend: React (ứng dụng riêng biệt)
- Không thay đổi schema hoặc thêm dịch vụ mới nếu không có chỉ đạo kiến trúc rõ ràng
- Không sử dụng thư viện không cần thiết
- Không refactor kiến trúc nếu không có yêu cầu rõ ràng

## Backend Rules
- Mọi endpoint phải sử dụng Fastify và TypeScript
- Mã nguồn phải modular, tách biệt rõ ràng các lớp logic, service, repository
- Không sử dụng console.log hoặc biến không dùng đến
- Tất cả endpoint phải rate limit
- Không gọi AI từ frontend
- Không lộ secret dưới bất kỳ hình thức nào

## Database Rules
- ORM duy nhất: Prisma
- Database duy nhất: PostgreSQL (Docker)
- Không thay đổi schema nếu không có chỉ đạo rõ ràng
- Mọi ghi dữ liệu phải đảm bảo transactional khi cần thiết
- Không tạo bảng hoặc trường mới nếu không có chỉ đạo

## AI Integration Rules
- Chỉ gọi AI (Gemini) từ backend
- Không bao giờ gọi AI từ frontend
- Phải kiểm tra grid cache trước khi gọi AI
- Không tin tưởng đầu ra AI, luôn sanitize trước khi lưu hoặc trả về
- Không lộ API key hoặc thông tin nhạy cảm
- Không blocking request thread khi gọi AI

## Job Processing Rules
- Mọi job nền phải chạy async trong API service
- Worker không được block request thread
- Job phải có trạng thái rõ ràng: QUEUED, RUNNING, DONE
- Không tạo job ngoài luồng xử lý đã định nghĩa

## Security Rules
- Không lộ secret, API key, thông tin nhạy cảm
- Tất cả endpoint phải rate limit
- Không tin tưởng dữ liệu đầu vào, luôn validate (Zod)
- Không expose thông tin nội bộ qua API

## Git & Versioning Rules
- Mọi thay đổi phải commit rõ ràng, có ý nghĩa
- Không push secret hoặc thông tin nhạy cảm lên git
- Không tạo branch hoặc merge vào main nếu chưa review
- Không thay đổi lịch sử commit nếu không có chỉ đạo

## Deployment Rules
- Chỉ triển khai qua môi trường Docker chuẩn hóa
- Không thay đổi cấu hình production nếu không có chỉ đạo
- Không lộ thông tin môi trường hoặc secret qua log hoặc output

## Things That Are Strictly Forbidden
- Gọi AI từ frontend
- Lộ secret, API key, thông tin nhạy cảm
- Thay đổi schema hoặc thêm dịch vụ mới nếu không có chỉ đạo
- Sử dụng thư viện không cần thiết
- Refactor kiến trúc nếu không có yêu cầu rõ ràng
- Không tuân thủ rate limit
- Không kiểm tra grid cache trước khi gọi AI
- Worker block request thread
- Ghi đè hoặc xóa dữ liệu không transactional
- Lưu hoặc trả về dữ liệu AI chưa sanitize
- Đẩy secret lên git
- Thay đổi cấu trúc hoặc quy tắc trong file này nếu không có chỉ đạo kiến trúc