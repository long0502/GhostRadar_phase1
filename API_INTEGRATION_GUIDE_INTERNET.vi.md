# Huong Dan Tich Hop API Tu App Khac (Internet + HTTPS + API Key)

Tai lieu nay mo ta dung he thong dang chay thuc te tren internet.

Muc tieu:
- App client ben ngoai chi goi qua `HTTPS` tren port `443`
- Khong goi truc tiep IP public
- Khong goi cac port la nhu `8001`, `8002` tu may client
- Tach ro 2 luong:
  - `AI text` tren subdomain text
  - `AI image` tren subdomain image

## 1. Domain dang dung

### 1.1 Text + Admin

- Runtime text: `https://aiapifulltxt.daquynangluongxanh.com`
- Admin UI: `https://aiapifulltxt.daquynangluongxanh.com/admin`
- Admin API: `https://aiapifulltxt.daquynangluongxanh.com/admin/api/*`

### 1.2 Image generation

- Runtime image: `https://aiapifullimg.daquynangluongxanh.com`

### 1.3 Swagger docs

- Text docs: `https://aiapifulltxt.daquynangluongxanh.com/docs`
- Image docs: `https://aiapifullimg.daquynangluongxanh.com/docs`

Luu y:

- Docs da duoc tach rieng theo service text va image
- Nhom `admin` van giu nguyen tren ca 2 docs

## 2. Quy uoc quan trong

### 2.1 Khong dung IP/port noi bo tu app client

Khong dung cac URL kieu sau trong app ben ngoai:

- `http://<public-ip>`
- `http://<public-ip>:8001`
- `http://<public-ip>:8002`

Ly do:
- De tranh bi chan boi proxy/firewall nhu Zscaler
- De chi su dung `HTTPS` tren `443`
- De SSL va reverse proxy hoat dong on dinh

### 2.2 Chon dung subdomain theo loai request

- Neu muon nhan cau tra loi dang text:
  - dung `https://aiapifulltxt.daquynangluongxanh.com`
- Neu muon sinh anh tu prompt:
  - dung `https://aiapifullimg.daquynangluongxanh.com`

Khong gui image-generation vao subdomain text.
Khong gui text-analysis vao subdomain image.

## 3. Hai luong nghiep vu chinh

### 3.1 Luong AI text

Subdomain:

- `https://aiapifulltxt.daquynangluongxanh.com`

Cong dung:

- Cau hoi text thuong
- Text + 1 anh
- Text + 2 anh
- So sanh 2 anh va tra loi bang text

Provider hien tai:

- `gpt`
- `gemini`

Luu y quan trong:

- Khi gui anh vao luong text va mong muon nhan cau tra loi bang text, dung `POST /ask/files`
- Trong truong hop nay, dung `type=text`
- Khong dung `type=image` cho case phan tich/so sanh anh tren subdomain text

Hop dong su dung cho app client:

- Ho tro 1 hoac 2 anh cho use case phan tich/so sanh anh
- Dinh dang anh nen dung:
  - `.png`
  - `.jpg`
  - `.jpeg`
  - `.webp`

### 3.2 Luong AI image

Subdomain:

- `https://aiapifullimg.daquynangluongxanh.com`

Cong dung:

- Nhan prompt text
- Tra ve 1 anh da generate

Provider hien tai:

- `gpt`
- `banana`

Luu y:

- Luong nay dung `POST /ask`
- Dung `type=image`
- App client ben ngoai nen coi day la luong `text -> image`
- Khong dung `/ask/files` cho image generation trong tai lieu tich hop app ben ngoai

## 4. Xac thuc

He thong dung 2 loai credential:

- `X-Admin-Token`
  - Chi dung cho admin API
  - Dung de tao/revoke API key
- `x-api-key`
  - Dung cho runtime endpoint
  - Dung cho `/ask`, `/ask/files`, `/jobs/{request_id}`

Hanh vi:

- Neu `API_KEY_REQUIRED=true`:
  - thieu key -> `401 Missing API key`
- Neu gui key sai:
  - `401 Invalid API key`

Luu y cho Swagger `/docs`:

1. Bam `Authorize`
2. Nhap gia tri vao header `x-api-key`
3. Chay lai `Try it out`

Neu khong authorize, runtime endpoint se tra HTTP `401`.

## 5. Tao API key

API key duoc tao qua admin API tren subdomain text:

```bash
curl -X POST "https://aiapifulltxt.daquynangluongxanh.com/admin/api/api-keys" \
  -H "X-Admin-Token: replace-with-a-strong-secret" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"internet-client\"}"
```

Response co:

- `item.id`
- `item.api_key`

Luu y:

- Full `api_key` chi hien thi 1 lan
- Can luu ngay sau khi tao

Revoke key:

```bash
curl -X POST "https://aiapifulltxt.daquynangluongxanh.com/admin/api/api-keys/<key_id>/revoke" \
  -H "X-Admin-Token: replace-with-a-strong-secret"
```

## 6. Luong async/polling chuan

Tat ca app client nen dung chung 1 luong:

1. Gui request qua `POST /ask` hoac `POST /ask/files`
2. Nhan `request_id` ngay voi `status=processing`
3. Poll `GET /jobs/{request_id}` moi `2-5` giay
4. Dung khi `status` la `success` hoac `error`
5. Neu payload co `download_url`, ghep voi base URL cua dung subdomain de tai artifact

## 7. Contract response

Tat ca endpoint runtime tra ve theo format:

```json
{
  "request_id": "string",
  "status": "processing | queued | success | error",
  "type": "text | image | video | system",
  "provider": "gpt | gemini | banana | null",
  "data": null,
  "error": null,
  "timing": null
}
```

Luu y:

- `data` thuong la chuoi JSON
- App client nen parse `data` neu `data` la string
- Trong luc poll, co the gap `status=queued` truoc khi sang `processing`
- `timing` cho biet job dang ton thoi gian o `queue`, `browser_ready`, `submit`, `generation`, `download_to_server` hay `processing_total`

## 8. Runtime endpoint theo tung subdomain

### 8.1 Text subdomain

Base:

- `https://aiapifulltxt.daquynangluongxanh.com`

Endpoint:

- `POST /ask`
- `POST /ask/files`
- `GET /jobs/{request_id}`
- `GET /downloads/{filename}`
- `GET /health`
- `GET /queue/status`
- `GET /system/info`

### 8.2 Image subdomain

Base:

- `https://aiapifullimg.daquynangluongxanh.com`

Endpoint:

- `POST /ask`
- `GET /jobs/{request_id}`
- `GET /downloads/{filename}`
- `GET /health`
- `GET /queue/status`
- `GET /system/info`

## 9. Vi du goi API qua internet

### 9.1 Goi text job thuong

```bash
curl -X POST "https://aiapifulltxt.daquynangluongxanh.com/ask" \
  -H "Content-Type: application/json" \
  -H "x-api-key: <your_api_key>" \
  -d "{\"prompt\":\"Reply EXACTLY: INTERNET_OK\",\"type\":\"text\",\"provider\":\"gpt\",\"timeout\":90}"
```

### 9.2 Gui 1 anh cho AI text phan tich

Luu y:

- van goi vao subdomain text
- van dung `type=text`

```bash
curl -X POST "https://aiapifulltxt.daquynangluongxanh.com/ask/files" \
  -H "x-api-key: <your_api_key>" \
  -F "prompt=Phan tich buc anh nay that chi tiet" \
  -F "provider=gpt" \
  -F "type=text" \
  -F "timeout=180" \
  -F "files=@./test.jpg;type=image/jpeg"
```

### 9.3 Gui 2 anh cho AI text so sanh

```bash
curl -X POST "https://aiapifulltxt.daquynangluongxanh.com/ask/files" \
  -H "x-api-key: <your_api_key>" \
  -F "prompt=So sanh 2 anh dinh kem va liet ke cac diem khac nhau" \
  -F "provider=gpt" \
  -F "type=text" \
  -F "timeout=240" \
  -F "files=@./image1.jpg;type=image/jpeg" \
  -F "files=@./image2.jpg;type=image/jpeg"
```

### 9.4 Goi AI image de generate anh

```bash
curl -X POST "https://aiapifullimg.daquynangluongxanh.com/ask" \
  -H "Content-Type: application/json" \
  -H "x-api-key: <your_api_key>" \
  -d "{\"prompt\":\"Create a single clean image of a bamboo forest at sunrise, cinematic style\",\"type\":\"image\",\"provider\":\"gpt\",\"timeout\":480}"
```

Ban co the thay `provider` bang `banana`:

```bash
curl -X POST "https://aiapifullimg.daquynangluongxanh.com/ask" \
  -H "Content-Type: application/json" \
  -H "x-api-key: <your_api_key>" \
  -d "{\"prompt\":\"Create a single clean image of a bamboo forest at sunrise, cinematic style\",\"type\":\"image\",\"provider\":\"banana\",\"timeout\":480}"
```

### 9.4.1 Truong hop app co nut `Chi tiet` va muon tao anh

Neu trong app cua ban co nut nhu:

- `Chi tiet`
- `Xem chi tiet`
- `Tao anh`
- `Mo phong anh`

va khi nhan nut do ban muon goi AI image, thi khuyen nghi dung flow sau:

1. Frontend goi backend cua chinh ban
2. Backend cua ban tu tao prompt
3. Backend cua ban goi:
   - `POST https://aiapifullimg.daquynangluongxanh.com/ask`
4. Backend cua ban poll:
   - `GET /jobs/{request_id}`
5. Khi `success`, backend tra lai:
   - `download_url`
   - hoac URL da ghep san day du cho frontend

Khong khuyen nghi:

- de frontend browser goi truc tiep admin API
- hardcode `x-api-key` o frontend
- de frontend tu ghep prompt phuc tap neu prompt do chua thong tin noi bo

Prompt mau cho nut `Chi tiet`:

```text
Tao 1 anh duy nhat, phong cach hien dai, mo ta chi tiet san pham sau:
- Ten: <ten_san_pham>
- Mo ta: <mo_ta>
- Diem noi bat: <bullet_1>, <bullet_2>, <bullet_3>
- Tong the: anh sach, ro, de dung cho giao dien chi tiet san pham
```

### 9.5 Poll ket qua job

Poll tren dung subdomain da submit job:

```bash
curl "https://aiapifulltxt.daquynangluongxanh.com/jobs/<request_id>" \
  -H "x-api-key: <your_api_key>"
```

hoac:

```bash
curl "https://aiapifullimg.daquynangluongxanh.com/jobs/<request_id>" \
  -H "x-api-key: <your_api_key>"
```

Neu `status=success`, parse `data`.

Neu `data.download_url = "/downloads/abc.png"` thi URL day du cho image service la:

- `https://aiapifullimg.daquynangluongxanh.com/downloads/abc.png`

Neu response co `timing`, co the doc nhanh:

- `timing.current_phase`
- `timing.timestamps`
- `timing.durations_seconds`

## 10. Mau Python cho text + anh

```python
import json
import time
import requests

BASE_URL = "https://aiapifulltxt.daquynangluongxanh.com"
API_KEY = "<your_api_key>"
HEADERS = {"x-api-key": API_KEY}


def parse_data_field(data_value):
    if data_value is None:
        return None
    if isinstance(data_value, str):
        try:
            return json.loads(data_value)
        except json.JSONDecodeError:
            return data_value
    return data_value


def submit_compare_two_images(image1_path: str, image2_path: str, prompt: str):
    with open(image1_path, "rb") as f1, open(image2_path, "rb") as f2:
        files = [
            ("files", ("image1.jpg", f1, "image/jpeg")),
            ("files", ("image2.jpg", f2, "image/jpeg")),
        ]
        form = {
            "prompt": prompt,
            "provider": "gpt",
            "type": "text",
            "timeout": "240",
        }
        r = requests.post(
            f"{BASE_URL}/ask/files",
            data=form,
            files=files,
            headers=HEADERS,
            timeout=60,
        )
        r.raise_for_status()
        return r.json()["request_id"]


def wait_job(request_id: str, poll_seconds: int = 3, max_wait_seconds: int = 600):
    started = time.time()
    while True:
        if time.time() - started > max_wait_seconds:
            raise TimeoutError(f"Job {request_id} timeout after {max_wait_seconds}s")
        r = requests.get(f"{BASE_URL}/jobs/{request_id}", headers=HEADERS, timeout=30)
        r.raise_for_status()
        payload = r.json()
        if payload.get("status") in ("success", "error"):
            payload["data_parsed"] = parse_data_field(payload.get("data"))
            return payload
        time.sleep(poll_seconds)
```

## 11. Mau Python cho image generation

```python
import json
import time
import requests

BASE_URL = "https://aiapifullimg.daquynangluongxanh.com"
API_KEY = "<your_api_key>"
HEADERS = {"x-api-key": API_KEY}


def parse_data_field(data_value):
    if data_value is None:
        return None
    if isinstance(data_value, str):
        try:
            return json.loads(data_value)
        except json.JSONDecodeError:
            return data_value
    return data_value


def submit_image_generation(prompt: str, provider: str = "gpt"):
    payload = {
        "prompt": prompt,
        "type": "image",
        "provider": provider,
        "timeout": 480,
    }
    r = requests.post(f"{BASE_URL}/ask", json=payload, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()["request_id"]


def wait_job(request_id: str, poll_seconds: int = 5, max_wait_seconds: int = 900):
    started = time.time()
    while True:
        if time.time() - started > max_wait_seconds:
            raise TimeoutError(f"Job {request_id} timeout after {max_wait_seconds}s")
        r = requests.get(f"{BASE_URL}/jobs/{request_id}", headers=HEADERS, timeout=30)
        r.raise_for_status()
        payload = r.json()
        if payload.get("status") in ("success", "error"):
            payload["data_parsed"] = parse_data_field(payload.get("data"))
            return payload
        time.sleep(poll_seconds)


def download_generated_file(download_url: str, output_path: str):
    r = requests.get(f"{BASE_URL}{download_url}", headers=HEADERS, timeout=120)
    r.raise_for_status()
    with open(output_path, "wb") as f:
        f.write(r.content)
```

## 11.1 Mau tich hop backend cho nut `Chi tiet`

Vi du duoi day la flow goi tu backend cua app khac.

Pseudo-flow:

1. Frontend nhan su kien click `Chi tiet`
2. Frontend goi backend noi bo cua ban, vi du:
   - `POST /internal/render-detail-image`
3. Backend tao prompt tu du lieu business
4. Backend goi image gateway
5. Backend poll den khi co `download_url`
6. Backend tra ket qua cho frontend

Input backend de goi image gateway:

```json
{
  "prompt": "Create a single clean image of ...",
  "type": "image",
  "provider": "gpt",
  "timeout": 480
}
```

Response frontend nen nhan tu backend cua ban:

```json
{
  "status": "success",
  "request_id": "string",
  "image_url": "https://aiapifullimg.daquynangluongxanh.com/downloads/abc.png"
}
```

## 12. Timeout goi y

- Text thuong: `90-180s`
- Text + anh / so sanh 2 anh: `180-240s`
- Image generation: `180-480s`

Cong thuc timeout client:

- `client_timeout_seconds >= estimated_wait_seconds_for_new_job + default_job_timeout_seconds + buffer`

Lay 2 gia tri nay tu:

- `GET /queue/status`

## 12.1 Cach doc `timing` de phan tich do tre

Vi du voi image generation:

- `queue_wait` cao:
  - job dang phai xep hang, khong phai AI tao anh cham
- `generation` cao:
  - provider dang tao noi dung cham
- `download_to_server` cao:
  - artifact lon hoac tai file cham
- `processing_total` cao nhung `queue_wait` thap:
  - can xem them session/browser state

Neu can xac nhan AI co tao duoc ket qua that hay khong, uu tien `admin smoke test` thay vi chi nhin `/health`.

## 13. Luu y cho frontend web

Neu goi truc tiep tu browser khac domain, ban co the gap CORS.

Khuyen nghi:

- Goi gateway qua backend cua ban theo mo hinh server-to-server
- Khong expose `ADMIN_TOKEN` ra frontend
- Khong de frontend goi truc tiep admin API

## 14. Checklist test nhanh

### 14.1 Text

1. `GET https://aiapifulltxt.daquynangluongxanh.com/health` tra `status=success`
2. `POST /ask` hoac `POST /ask/files` tra ve `request_id`
3. Poll `GET /jobs/{request_id}` tren cung subdomain den khi `success`
4. Neu la case text + 1/2 anh, bao dam request dung `type=text`

### 14.2 Image

1. `GET https://aiapifullimg.daquynangluongxanh.com/health` tra `status=success`
2. `POST /ask` voi `type=image`
3. Poll `GET /jobs/{request_id}` tren subdomain image den khi `success`
4. Neu `data.download_url` co gia tri, tai file qua `https://aiapifullimg.daquynangluongxanh.com/downloads/...`

Luu y quan trong:

- `/health` chi xac nhan runtime service va browser readiness co ban
- `/health` khong du de khang dinh AI chac chan tao duoc text/anh that
- De test end-to-end that, dung cac admin smoke endpoint

### 14.3 Admin smoke test va restart

Smoke test:

- `POST https://aiapifulltxt.daquynangluongxanh.com/admin/api/smoke/text`
- `POST https://aiapifullimg.daquynangluongxanh.com/admin/api/smoke/image`

Restart rieng tung service:

- `POST https://aiapifulltxt.daquynangluongxanh.com/admin/api/service/restart`
- `POST https://aiapifullimg.daquynangluongxanh.com/admin/api/service/restart`

Header bat buoc:

- `X-Admin-Token: <admin_token>`

Body mau:

```json
{
  "scope": "text"
}
```

hoac:

```json
{
  "scope": "image"
}
```

## 15. Loi thuong gap

### 15.1 `401 Missing API key`

Nguyen nhan:

- Chua gui header `x-api-key`

Neu dang test tren `/docs`:

- chua bam `Authorize`
- hoac da nhap key nhung tab docs chua refresh schema moi

### 15.2 `401 Invalid API key`

Nguyen nhan:

- API key sai
- API key da bi revoke

### 15.3 Goi sai subdomain

Vi du:

- Gui image-generation vao `aiapifulltxt...`
- Gui text-analysis vao `aiapifullimg...`

Khac phuc:

- Text/analysis -> `aiapifulltxt...`
- Image generation -> `aiapifullimg...`

### 15.4 Gui text + anh nhung dung `type=image`

Day la loi tich hop de gap.

Dung:

- `POST /ask/files`
- `type=text`
- subdomain `aiapifulltxt...`

Khong dung:

- subdomain text + `type=image` cho use case phan tich/so sanh anh va nhan cau tra loi bang text

### 15.5 Muon tai artifact nhung mo sai host

Neu job duoc tao tren image service, `download_url` phai duoc ghep voi:

- `https://aiapifullimg.daquynangluongxanh.com`

Khong ghep voi text subdomain.
