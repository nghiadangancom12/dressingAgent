"""
Script xây dựng và đóng gói Agent theo chuẩn Allard Agent Marketplace v1alpha3.
Đảm bảo đáp ứng đầy đủ:
- Tầng 2: Chuẩn cốt lõi (CORE Rules: C-001 -> C-011)
- Tầng 3: Chuẩn thương mại & Lên kệ (MARKET Rules: M-002 -> M-030)
"""

import os
import shutil
import sys
import subprocess
from pathlib import Path
from PIL import Image
import yaml

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Đường dẫn thư mục
WORKSPACE_DIR = Path(__file__).resolve().parent
PACKAGE_SRC_DIR = WORKSPACE_DIR / "marketplace_package"
DIST_DIR = WORKSPACE_DIR / "dist"
PLATFORM_DIR = Path(r"C:\Users\VINLAP\Downloads\AI_Mangagement\Agent_Management")
PLATFORM_VENDOR_DIR = PLATFORM_DIR / "backend" / "app" / "services" / "marketplace_export" / "vendor"
PLATFORM_ASSETS_DIR = PLATFORM_DIR / "backend" / "app" / "services" / "marketplace_export" / "assets"


def generate_icon(dest_path: Path):
    """Tạo icon PNG 512x512 vuông có kênh Alpha theo chuẩn M-012."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    hero_src = WORKSPACE_DIR / "client" / "src" / "assets" / "hero.png"
    target_size = 512
    canvas = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))

    if hero_src.exists():
        im = Image.open(hero_src).convert("RGBA")
        # Giữ tỉ lệ, co vừa vặn trong khung 460x460
        im.thumbnail((460, 460), Image.Resampling.LANCZOS)
        offset = ((target_size - im.width) // 2, (target_size - im.height) // 2)
        canvas.paste(im, offset, im)
    else:
        # Fallback copy từ platform
        canvas = Image.open(PLATFORM_ASSETS_DIR / "icon.png").convert("RGBA")

    canvas.save(dest_path, format="PNG")
    print(f"✅ Đã tạo Icon: {dest_path} (512x512, RGBA, có alpha)")


def generate_manifest(dest_path: Path):
    """Tạo file agent.yaml theo chuẩn C-001 -> C-005, M-002, M-007, M-009, M-013, M-015, M-027, M-028."""
    manifest = {
        "apiVersion": "agent.platform/v1alpha3",
        "kind": "Agent",
        "metadata": {
            "id": "sphinx/fashion-search-agent",
            "version": "1.0.0",
            "name": "Fashion AI - Trợ Lý Phối Đồ Thông Minh",
            "description": "Trợ lý AI chuyên tìm kiếm thời trang, tư vấn kích cỡ và phối đồ thông minh theo vóc dáng người dùng.",
            "license": "proprietary",
        },
        "permissions": [
            {
                "id": "write.external",
                "reason": "Truy vấn API tìm kiếm sản phẩm thời trang và tạo hình ảnh phối đồ thực tế",
            },
            {
                "id": "write.memory",
                "reason": "Ghi nhớ số đo cá nhân, phong cách thời trang và sở thích phối đồ",
            },
            {
                "id": "read.buyer_docs",
                "reason": "Đọc hình ảnh sản phẩm hoặc tài liệu người mua cung cấp để phối đồ phù hợp",
            },
        ],
        "data": {
            "humanReview": "none",
            "training": "no",
            "retentionDays": 90,
            "userCanExport": True,
            "userCanDelete": True,
            "storedIn": "VN",
        },
        "metering": {
            "pricing": {
                "model": "free"
            }
        },
        "listing": {
            "category": "lifestyle",
            "tags": [
                "sphinx",
                "thoi-trang",
                "phoi-do",
                "fashion",
                "tu-van-trang-phuc",
                "tieng-viet",
            ],
            "icon": "./assets/icon.png",
            "screenshots": [],
            "overview": "./LISTING.md",
            "guide": "./GUIDE.md",
            "support": "mailto:support@sphinxjsc.vn",
            "localized": {
                "vi-VN": {
                    "name": "Fashion AI - Trợ Lý Phối Đồ Thông Minh",
                    "summary": "Trợ lý AI chuyên tìm kiếm thời trang, tư vấn kích cỡ và phối đồ thông minh theo vóc dáng người dùng.",
                    "greeting": "Chào bạn! Mình là Fashion AI, trợ lý tư vấn phong cách thời trang và phối đồ thông minh.",
                    "starters": [],
                }
            },
        },
        "tools": {
            "builtin": ["get_time"]
        },
        "installer": {
            "entry": "./installer/setup.exe"
        },
        "platform": {
            "baseUrl": "http://localhost:8000",
            "hasAppLayout": False
        },
        "domain": "business",
        "files": [],
    }

    with open(dest_path, "w", encoding="utf-8", newline="\n") as f:
        yaml.safe_dump(manifest, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
    print(f"✅ Đã tạo Manifest: {dest_path}")


def generate_listing(dest_path: Path):
    """Tạo LISTING.md theo chuẩn M-023 (<= 4000 ký tự)."""
    content = """# Fashion AI - Trợ Lý Phối Đồ & Tìm Kiếm Thời Trang Thông Minh

Fashion AI là trợ lý trí tuệ nhân tạo chuyên biệt trong lĩnh vực thời trang, giúp giải quyết triệt để bài toán "hôm nay mặc gì" cho người dùng cá nhân cũng như hỗ trợ tư vấn bán hàng cho các thương hiệu thời trang.

## Tính Năng Nổi Bật

1. **Tư vấn trang phục theo dáng người**: Phân tích chiều cao, cân nặng, tỷ lệ cơ thể và giới tính để đưa ra gợi ý size đồ và form dáng tối ưu nhất.
2. **Tìm kiếm sản phẩm thông minh**: Tự động tìm kiếm trang phục tương thích từ các danh mục thời trang theo ngân sách, màu sắc và phong cách mong muốn.
3. **Phối đồ nguyên set (Mix & Match)**: Tự động kết hợp áo, quần/váy, giày dép và phụ kiện đồng điệu cho mọi hoàn cảnh: công sở, dạo phố, thể thao hay dạ tiệc.
4. **Minh họa trực quan bằng hình ảnh**: Tạo ảnh phối đồ người mẫu mặc nguyên set đồ chân thực giúp người mua dễ dàng hình dung trước khi chọn mua.
5. **Giao tiếp tự nhiên tiếng Việt**: Hiểu rõ ngữ cảnh và cách diễn đạt mua sắm của người Việt.

## Dành Cho Ai

- **Người tiêu dùng cá nhân**: Cần định hình phong cách, tìm kiếm trang phục phù hợp với dáng người và tiết kiệm thời gian chọn đồ.
- **Doanh nghiệp thời trang & Stylist**: Tích hợp trợ lý tư vấn tự động 24/7 để gia tăng trải nghiệm khách hàng và tỉ lệ chuyển đổi đơn hàng.

## Cam Kết Dữ Liệu & Bản Quyền

- **Lưu trữ an toàn tại Việt Nam (VN)** trong 90 ngày.
- **Quyền riêng tư tối đa**: Không tự ý huấn luyện dữ liệu từ cuộc hội thoại của khách (`training: no`).
- **Quyền làm chủ dữ liệu**: Người dùng có toàn quyền xuất dữ liệu và yêu cầu xóa vĩnh viễn bất kỳ lúc nào.
"""
    assert len(content) <= 4000, f"LISTING.md vượt quá 4000 ký tự ({len(content)})"
    with open(dest_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"✅ Đã tạo LISTING.md ({len(content)} ký tự)")


def generate_guide(dest_path: Path):
    """Tạo GUIDE.md theo chuẩn M-023 (<= 40000 ký tự)."""
    content = """# Hướng Dẫn Sử Dụng Fashion AI Agent

Chào mừng bạn đến với **Fashion AI - Trợ Lý Phối Đồ & Tìm Kiếm Thời Trang Thông Minh**! Tài liệu này sẽ hướng dẫn bạn từ khâu cài đặt tới việc khai thác tối đa sức mạnh của trợ lý.

---

## 1. Cài Đặt Ứng Dụng

1. Tải gói agent từ Agent Store của nền tảng.
2. Khởi chạy file `setup.exe` trong gói cài đặt đã được ký số Authenticode an toàn.
3. Trình duyệt hoặc ứng dụng Agent Player sẽ tự động mở trang tương tác với Fashion AI.

---

## 2. Bắt Đầu Phiên Làm Việc

1. **Kiểm tra Platform Base URL**: Đảm bảo địa chỉ nền tảng trỏ đúng về hệ thống quản lý Agent của bạn.
2. **Nhập Token xác thực**: Dán mã token phiên được cấp từ chợ hoặc từ quản trị viên vào ô xác thực.
3. **Bấm "Mở phiên"** để kích hoạt kết nối với Fashion AI.

---

## 3. Các Luồng Sử Dụng Chính

### 3.1. Cung cấp thông số vóc dáng và phong cách
Bạn có thể nhắn trực tiếp với Fashion AI:
- *"Mình là nam, cao 1m75, nặng 68kg, cần tìm set đồ đi làm công sở lịch sự nhưng trẻ trung, ngân sách dưới 1.5 triệu."*
- *"Tư vấn set đồ đi biển cho nữ cao 1m60, 50kg, tone màu pastel nhẹ nhàng."*

### 3.2. Tìm kiếm món đồ cụ thể theo ngân sách
- *"Tìm cho mình áo sơ mi oxford trắng size L giá dưới 500k."*
- *"Gợi ý quần jean ống suông nam phối với giày sneaker cổ thấp."*

### 3.3. Xem phối đồ nguyên set và ảnh minh họa
Fashion AI sẽ:
1. Đề xuất bảng chi tiết từng món đồ (Áo, Quần, Giày, Phụ kiện) kèm tầm giá.
2. Gợi ý bảng size chuẩn dựa trên số đo của bạn.
3. Sinh ảnh minh họa người mẫu mặc set đồ hoàn chỉnh để bạn duyệt phong cách.

---

## 4. Quản Lý Quyền Riêng Tư & Dữ Liệu

- **Xuất dữ liệu**: Bạn có thể yêu cầu trích xuất toàn bộ lịch sử tư vấn và hồ sơ số đo của mình bất cứ lúc nào.
- **Xóa dữ liệu**: Bạn có toàn quyền xóa vĩnh viễn các thông tin đã lưu trữ khỏi hệ thống.
- **Bảo mật**: Dữ liệu hội thoại không được dùng để huấn luyện mô hình khi chưa có sự đồng ý riêng của bạn.

---

## 5. Hỗ Trợ Kỹ Thuật

Mọi thắc mắc hoặc yêu cầu hỗ trợ, vui lòng liên hệ:
- Email: `support@sphinxjsc.vn`
"""
    assert len(content) <= 40000, f"GUIDE.md vượt quá 40000 ký tự ({len(content)})"
    with open(dest_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"✅ Đã tạo GUIDE.md ({len(content)} ký tự)")


def generate_license(dest_path: Path):
    """Tạo LICENSE.txt theo chuẩn M-010."""
    content = """GIẤY PHÉP SỬ DỤNG PHẦN MỀM THỜI TRANG FASHION AI (PROPRIETARY)

Bản quyền thuộc về Sphinx JSC & Đội ngũ Phát triển Fashion AI.
Tất cả các quyền được bảo lưu.

1. CẤP PHÉP:
Phần mềm này được cấp quyền sử dụng độc quyền (proprietary) cho người mua hợp pháp
thông qua Allard Agent Management Platform theo đúng phạm vi gói đã đăng ký.

2. CÁC HÀNH VI BỊ CẤM:
- Nghiêm cấm phân phối lại, bán lại, cho thuê hoặc chuyển nhượng gói phần mềm khi
  chưa có văn bản đồng ý chính thức.
- Nghiêm cấm dịch ngược (reverse-engineer), can thiệp mã nhị phân của các tệp thực thi.

3. DỮ LIỆU & BẢO HÀNH:
Phần mềm tuân thủ nghiêm ngặt các cam kết tại khối `data` của agent.yaml:
- Lưu trữ dữ liệu tại Việt Nam (VN).
- Hỗ trợ người dùng xuất dữ liệu và xóa dữ liệu hoàn toàn.
- Không huấn luyện dữ liệu từ cuộc hội thoại khi chưa được sự cho phép.

Liên hệ hỗ trợ bản quyền: support@sphinxjsc.vn
"""
    with open(dest_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"✅ Đã tạo LICENSE.txt")


def copy_signed_installer(dest_dir: Path):
    """Copy setup.exe đã có chữ ký Authenticode từ platform sang gói để đáp ứng M-030."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    src_installer = PLATFORM_ASSETS_DIR / "installer" / "setup.exe"
    dest_installer = dest_dir / "setup.exe"

    if not src_installer.exists():
        raise FileNotFoundError(f"Không tìm thấy file installer gốc tại: {src_installer}")

    shutil.copyfile(src_installer, dest_installer)
    print(f"✅ Đã sao chép Installer có chữ ký Authenticode: {dest_installer} ({dest_installer.stat().st_size:,} bytes)")


def prepare_package_source():
    """Tạo toàn bộ cây thư mục mã nguồn gói."""
    if PACKAGE_SRC_DIR.exists():
        shutil.rmtree(PACKAGE_SRC_DIR)
    PACKAGE_SRC_DIR.mkdir(parents=True, exist_ok=True)

    generate_manifest(PACKAGE_SRC_DIR / "agent.yaml")
    generate_listing(PACKAGE_SRC_DIR / "LISTING.md")
    generate_guide(PACKAGE_SRC_DIR / "GUIDE.md")
    generate_license(PACKAGE_SRC_DIR / "LICENSE.txt")
    generate_icon(PACKAGE_SRC_DIR / "assets" / "icon.png")
    copy_signed_installer(PACKAGE_SRC_DIR / "installer")

    print("\n📦 Thư mục nguồn gói đã sẵn sàng tại:", PACKAGE_SRC_DIR)


def run_checks_and_pack():
    """Sử dụng trực tiếp công cụ agentctl của platform để kiểm tra và đóng gói."""
    agentctl_py = PLATFORM_VENDOR_DIR / "agentctl.py"
    if not agentctl_py.exists():
        raise FileNotFoundError(f"Không tìm thấy agentctl.py tại: {agentctl_py}")

    print("\n" + "=" * 60)
    print("🔍 BƯỚC 1: KIỂM TRA CHUẨN TUÂN THỦ (HỒ SƠ CORE + MARKET) TRÊN THƯ MỤC NGUỒN")
    print("=" * 60)

    # Chạy agentctl check --profile market trên thư mục nguồn
    res_check = subprocess.run(
        [sys.executable, str(agentctl_py), "check", "--profile", "market", str(PACKAGE_SRC_DIR)],
        cwd=PLATFORM_VENDOR_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    print(res_check.stdout)
    if res_check.stderr:
        print(res_check.stderr)

    if res_check.returncode != 0:
        print("❌ Kiểm tra thư mục nguồn THẤT BẠI!")
        sys.exit(res_check.returncode)

    print("\n" + "=" * 60)
    print("📦 BƯỚC 2: TIẾN HÀNH ĐÓNG GÓI (.agent) VÀ TÍNH TOÁN SHA256 HASH TABLE")
    print("=" * 60)

    DIST_DIR.mkdir(parents=True, exist_ok=True)
    res_pack = subprocess.run(
        [sys.executable, str(agentctl_py), "pack", str(PACKAGE_SRC_DIR), "-o", str(DIST_DIR), "--print-json"],
        cwd=PLATFORM_VENDOR_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    print(res_pack.stdout)
    if res_pack.stderr:
        print(res_pack.stderr)

    if res_pack.returncode != 0:
        print("❌ Đóng gói THẤT BẠI!")
        sys.exit(res_pack.returncode)

    # Tìm file .agent vừa tạo
    agent_files = list(DIST_DIR.glob("*.agent"))
    if not agent_files:
        print("❌ Không tìm thấy file .agent trong dist!")
        sys.exit(1)

    latest_package = sorted(agent_files, key=lambda f: f.stat().st_mtime)[-1]
    print(f"\n🎉 File .agent đã được đóng gói thành công: {latest_package}")
    print(f"   Kích thước: {latest_package.stat().st_size:,} bytes")

    print("\n" + "=" * 60)
    print("🔍 BƯỚC 3: KIỂM DUYỆT TÍNH TOÀN VẸN CỦA FILE .agent ĐÃ ĐÓNG GÓI")
    print("=" * 60)

    res_verify = subprocess.run(
        [sys.executable, str(agentctl_py), "check", "--profile", "market", str(latest_package)],
        cwd=PLATFORM_VENDOR_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    print(res_verify.stdout)
    if res_verify.stderr:
        print(res_verify.stderr)

    if res_verify.returncode == 0:
        print("\n✨ CHÚC MỪNG! Gói Agent đạt 100% tiêu chí Tầng 2 (CORE: 11/11) và Tầng 3 (MARKET: 14/14)!")
    else:
        print("❌ Kiểm tra file .agent chưa đạt!")
        sys.exit(res_verify.returncode)


if __name__ == "__main__":
    prepare_package_source()
    run_checks_and_pack()
