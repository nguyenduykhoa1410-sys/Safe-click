"use strict";

/* ========================================
   1. DỮ LIỆU & TIỆN ÍCH
======================================== */

// Tên thương hiệu hay bị giả mạo -> tên miền chính thức
const BRANDS = {
    vietcombank: ["vietcombank.com.vn", "vietcombank.com"],
    techcombank: ["techcombank.com.vn", "techcombank.com"],
    vietinbank: ["vietinbank.vn"],
    agribank: ["agribank.com.vn"],
    mbbank: ["mbbank.com.vn"],
    bidv: ["bidv.com.vn", "bidv.vn"],
    momo: ["momo.vn"],
    zalopay: ["zalopay.vn"],
    shopee: ["shopee.vn", "shopee.com"],
    tiktok: ["tiktok.com"],
    facebook: ["facebook.com", "fb.com"],
    paypal: ["paypal.com"],
    vnpost: ["vnpost.vn"]
};

const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "ow.ly"];
const RISKY_TLDS = [".xyz", ".top", ".click", ".icu", ".cfd", ".sbs", ".buzz", ".monster"];

// Bỏ dấu, hạ chữ thường để so khớp được cả văn bản không dấu
const norm = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

const $ = (selector) => document.querySelector(selector);

function brandIn(text) {
    const t = norm(text).replace(/[\s._-]/g, "");
    return Object.keys(BRANDS).find((b) => t.includes(b));
}

function isOfficial(host, brand) {
    return BRANDS[brand].some((d) => host === d || host.endsWith("." + d));
}

/* ========================================
   2. PHÂN TÍCH URL
======================================== */

// Kiểm tra một tên miền. Trả về danh sách {w: trọng số, m: nội dung}
function analyzeHost(host) {
    const found = [];
    const add = (w, m) => found.push({ w, m });

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) {
        add(3, "Địa chỉ dùng số IP thay vì tên miền.");
    }
    if (SHORTENERS.includes(host)) {
        add(2, "Đây là link rút gọn, không nhìn thấy được đích đến thật.");
    }
    if (host.includes("xn--")) {
        add(2, "Tên miền có ký tự quốc tế mã hóa (punycode), dễ bị dùng để giả mạo.");
    }

    const brand = brandIn(host);
    if (brand && !isOfficial(host, brand)) {
        add(4, `Tên miền chứa "${brand}" nhưng không phải tên miền chính thức (${BRANDS[brand][0]}).`);
    }

    if (host.split(".").length > 4) {
        add(1, "Tên miền có nhiều cấp phụ, hãy xem kỹ tên miền chính ở cuối.");
    }
    if ((host.match(/-/g) || []).length >= 3) {
        add(1, "Tên miền chứa nhiều dấu gạch ngang.");
    }
    if (RISKY_TLDS.some((tld) => host.endsWith(tld))) {
        add(1, "Đuôi tên miền thường bị lạm dụng trong các trang lừa đảo.");
    }
    if (/login|verify|secure|xacminh|otp|account|update/.test(norm(host))) {
        add(1, "Tên miền chứa từ khóa như đăng nhập, xác minh hoặc OTP.");
    }
    return found;
}

// Phân tích một đường link. Trả về {error} hoặc {host, found, assumed}
function analyzeUrl(raw) {
    let text = raw.trim().replace(/[.,;:!?]+$/, "");
    if (!text) return { error: "Bạn chưa nhập đường link." };

    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
    if (!hasScheme) text = "https://" + text;

    let url;
    try {
        url = new URL(text);
    } catch {
        return { error: "Không thể phân tích đường link. Hãy nhập dạng https://example.com." };
    }
    if (!["http:", "https:"].includes(url.protocol)) {
        return { error: "Chỉ hỗ trợ đường link bắt đầu bằng http:// hoặc https://." };
    }

    const found = [];
    if (url.protocol === "http:") found.push({ w: 1, m: "Đường link không dùng HTTPS." });
    if (url.username || url.password) {
        found.push({ w: 3, m: "Đường link chứa thông tin đăng nhập trước tên miền, thường dùng để đánh lừa." });
    }
    found.push(...analyzeHost(url.hostname.toLowerCase()));

    return { host: url.hostname.toLowerCase(), found, assumed: !hasScheme };
}

/* ========================================
   3. PHÂN TÍCH EMAIL / TIN NHẮN
======================================== */

const TEXT_RULES = [
    { w: 2, m: "Ngôn ngữ thúc giục, tạo áp lực phải hành động nhanh.",
      re: /khan cap|ngay lap tuc|ngay bay gio|trong 24 gio|trong vong \d+ (gio|phut)|het han|han chot/ },
    { w: 2, m: "Đe dọa khóa hoặc hủy tài khoản, thẻ, SIM.",
      re: /(tai khoan|the|sim).{0,30}(bi khoa|bi dong|bi tam khoa|bi huy|bi han che)|se bi khoa|phat nguoi/ },
    { w: 3, m: "Yêu cầu cung cấp mật khẩu, OTP hoặc thông tin cá nhân/ngân hàng.",
      re: /(cung cap|nhap|gui|xac nhan|xac minh|cap nhat).{0,40}(otp|mat khau|cccd|so the|thong tin ngan hang|thong tin ca nhan)/,
      clean: (t) => t.replace(/(khong|dung|tuyet doi khong)\s+(chia se|cung cap|tiet lo|gui|nhap)/g, "") },
    { w: 2, m: "Nhắc đến trúng thưởng, nhận quà hoặc hoàn tiền bất ngờ.",
      re: /trung thuong|trung giai|nhan qua|qua tang mien phi|hoan tien/ },
    { w: 2, m: "Yêu cầu chuyển tiền, đặt cọc hoặc nộp phí.",
      re: /chuyen khoan|nap tien|dat coc|phi (nhan|van chuyen|xu ly)/ },
    { w: 2, m: "Mẫu tuyển cộng tác viên, việc nhẹ lương cao thường gặp trong lừa đảo.",
      re: /cong tac vien|viec nhe luong cao|lam tai nha/ },
    { w: 1, m: "Lời chào chung chung, không gọi đúng tên người nhận.",
      re: /kinh gui quy khach|khach hang than men|dear customer/ }
];

function analyzeMessage(sender, subject, content) {
    const found = [];
    const text = norm(subject + " " + content);
    const links = [...new Set(content.match(/(?:https?:\/\/|www\.)[^\s<>"')]+/gi) || [])].slice(0, 5);

    // Quy tắc theo nội dung
    let sensitive = false;
    TEXT_RULES.forEach((rule) => {
        const t = rule.clean ? rule.clean(text) : text;
        if (rule.re.test(t)) {
            found.push({ w: rule.w, m: rule.m });
            if (rule.w === 3) sensitive = true;
        }
    });
    if (sensitive && links.length) {
        found.push({ w: 1, m: "Yêu cầu thông tin nhạy cảm kèm đường link là mẫu lừa đảo rất phổ biến." });
    }

    // Người gửi: hỗ trợ dạng "Tên hiển thị" <địa chỉ>
    if (sender) {
        const m = sender.match(/^(.*?)<([^>]+)>\s*$/);
        const name = m ? m[1].replace(/["']/g, "").trim() : "";
        const addr = (m ? m[2] : sender).trim();

        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
            const domain = addr.split("@")[1].toLowerCase();
            analyzeHost(domain).forEach((f) => found.push({ w: f.w, m: "Tên miền người gửi: " + f.m }));

            const brand = brandIn(name);
            if (brand && !isOfficial(domain, brand)) {
                found.push({ w: 4, m: `Tên hiển thị nhắc đến "${brand}" nhưng email gửi từ tên miền ${domain}.` });
            }
        } else if (!/^\+?[\d\s.]{8,15}$/.test(addr)) {
            found.push({ w: 1, m: "Người gửi không đúng định dạng email hoặc số điện thoại." });
        }
    }

    // Từng đường link trong nội dung
    links.forEach((link) => {
        const r = analyzeUrl(link);
        if (r.error) return;
        const total = r.found.reduce((s, f) => s + f.w, 0);
        if (total >= 2) {
            found.push({ w: Math.min(total, 4), m: `Đường link ${r.host}: ${r.found.map((f) => f.m).join(" ")}` });
        }
    });

    return found;
}

/* ========================================
   4. HIỂN THỊ KẾT QUẢ
======================================== */

const LEVELS = {
    none: {
        title: "Chưa phát hiện dấu hiệu theo quy tắc cơ bản",
        summary: "Điều này không chứng minh là an toàn. SafeClick chỉ dùng một số quy tắc đơn giản.",
        advice: ["Vẫn nên xác minh người gửi qua kênh chính thức.", "Tự gõ địa chỉ website thay vì bấm link nhận được."]
    },
    low: {
        title: "Có vài điểm cần lưu ý",
        summary: "Các dấu hiệu dưới đây chưa đủ để kết luận, nhưng bạn nên cẩn thận.",
        advice: ["Kiểm tra kỹ người gửi và tên miền.", "Chưa nên bấm link hoặc tải tệp đính kèm khi chưa xác minh."]
    },
    mid: {
        title: "Đáng ngờ, nên xác minh trước khi làm theo",
        summary: "Có nhiều dấu hiệu thường gặp trong các vụ lừa đảo.",
        advice: ["Không bấm link, không trả lời, không cung cấp thông tin.", "Liên hệ tổ chức liên quan qua số điện thoại hoặc ứng dụng chính thức."]
    },
    high: {
        title: "Nhiều dấu hiệu lừa đảo",
        summary: "Nội dung này khớp với nhiều mẫu lừa đảo phổ biến. Hãy xử lý như thể nó không an toàn.",
        advice: [
            "Không bấm link, không cung cấp mật khẩu, OTP hay thông tin cá nhân.",
            "Nếu đã nhập thông tin, đổi mật khẩu ngay và liên hệ ngân hàng hoặc nhà cung cấp dịch vụ.",
            "Báo cáo tin nhắn là spam/lừa đảo và cảnh báo người thân."
        ]
    }
};

function levelOf(score) {
    if (score === 0) return "none";
    if (score <= 2) return "low";
    if (score <= 4) return "mid";
    return "high";
}

function renderResult(container, found, noneSummary) {
    const score = found.reduce((s, f) => s + f.w, 0);
    const key = levelOf(score);
    const info = LEVELS[key];

    const heading = document.createElement("h3");
    heading.textContent = info.title;

    const summary = document.createElement("p");
    summary.textContent = key === "none" ? noneSummary || info.summary : info.summary;

    container.className = "result " + key;
    container.replaceChildren(heading, summary);

    if (found.length) {
        container.append(makeList("Dấu hiệu phát hiện", found.map((f) => f.m)));
    }
    container.append(makeList("Bạn nên làm gì tiếp theo", info.advice));
}

function makeList(title, items) {
    const wrap = document.createDocumentFragment();
    const h = document.createElement("h4");
    h.textContent = title;
    const ul = document.createElement("ul");
    items.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
    });
    wrap.append(h, ul);
    return wrap;
}

function renderError(container, message) {
    const heading = document.createElement("h3");
    heading.textContent = "Chưa thể phân tích";
    const p = document.createElement("p");
    p.textContent = message;
    container.className = "result low";
    container.replaceChildren(heading, p);
}

/* ========================================
   5. FORM
======================================== */

const SAMPLES = {
    "link-form": { url: "http://vietcombank.com.vn.xacminh-taikhoan.xyz/login" },
    "email-form": {
        sender: '"Vietcombank" <noreply@vcb-support.top>',
        subject: "KHẨN CẤP: Tài khoản sẽ bị khóa trong 24 giờ",
        content:
            "Kính gửi quý khách, tài khoản của bạn có giao dịch bất thường. " +
            "Vui lòng xác minh tài khoản và cung cấp mã OTP tại http://vietcombank-xacminh.xyz/login " +
            "trong vòng 24 giờ, nếu không tài khoản sẽ bị khóa."
    }
};

const linkForm = $("#link-form");
const emailForm = $("#email-form");

linkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = $("#url-result");
    const r = analyzeUrl($("#url-input").value);

    if (r.error) return renderError(result, r.error);

    renderResult(result, r.found, "SafeClick chưa đối chiếu đường link với cơ sở dữ liệu website độc hại.");
    if (r.assumed) {
        const note = document.createElement("p");
        note.textContent = "Đường link không có http(s):// nên SafeClick phân tích như https://" + r.host;
        result.append(note);
    }
});

emailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = $("#email-result");
    const sender = $("#email-sender").value.trim();
    const subject = $("#email-subject").value.trim();
    const content = $("#email-content").value.trim();

    if (!content) return renderError(result, "Hãy dán nội dung email hoặc tin nhắn cần kiểm tra.");

    renderResult(result, analyzeMessage(sender, subject, content), "Hãy xác minh người gửi qua kênh chính thức trước khi làm theo.");
});

// Nút "Thử ví dụ mẫu"
document.querySelectorAll("[data-sample]").forEach((button) => {
    button.addEventListener("click", () => {
        const form = button.closest("form");
        const sample = SAMPLES[form.id];
        Object.keys(sample).forEach((name) => {
            form.elements[name].value = sample[name];
        });
        form.requestSubmit();
    });
});

/* ========================================
   6. ĐIỀU HƯỚNG THEO URL HASH
   #choose-check -> màn chọn | #check-link / #check-email -> form
======================================== */

const chooseSection = $("#choose-check");
const checkSections = [...document.querySelectorAll(".check-section")];
let currentForm = null;

function route() {
    const id = location.hash.slice(1);
    const target = checkSections.find((s) => s.id === id);

    if (target) currentForm = target;
    else if (id === "choose-check") currentForm = null;
    // Hash khác (#home, #faq...) giữ nguyên trạng thái hiện tại

    checkSections.forEach((s) => {
        s.classList.toggle("is-visible", s === currentForm);
        if (s !== currentForm) {
            s.querySelector("form").reset();
            s.querySelector(".result").replaceChildren();
        }
    });
    chooseSection.classList.toggle("is-hidden", Boolean(currentForm));

    // Chuyển focus và cuộn tới phần mới để người dùng bàn phím/trình đọc màn hình không bị lạc
    const section = target || (id === "choose-check" ? chooseSection : null);
    if (section) {
        section.scrollIntoView();
        section.querySelector("h2").focus({ preventScroll: true });
    }
}

window.addEventListener("hashchange", route);
route();
