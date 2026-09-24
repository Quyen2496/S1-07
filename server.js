const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { register, login } = require('./controllers/authController');

const app = express();
app.use(express.json());

// Kết nối MongoDB
// mongoose.connect('mongodb://localhost:27017/quanly_nhom')
//   .then(() => {
//     console.log('Kết nối Database thành công!');
//   })
//   .catch(err => console.log('Lỗi kết nối DB:', err));

// Routes API Auth
app.post('/api/register', register);
app.post('/api/login', login);

// Lời giải cho S2-07: Lưu vết lịch sử đặt phòng theo IP để chống spam
const bookingLogs = {};

// API Gửi yêu cầu đặt phòng (S2-07)
app.post('/api/bookings', (req, res) => {
  const { 
    fullName, 
    phone, 
    email, 
    guestCount, 
    note, 
    agreedPolicy, 
    roomId 
  } = req.body;
  
  const userIp = req.ip || req.socket.remoteAddress;

  // 1. Kiểm tra xác nhận chính sách hủy & Biểu mẫu
  if (!agreedPolicy) {
    return res.status(400).json({ 
      error: true, 
      message: "Bạn phải tích chọn xác nhận đã đọc chính sách hủy!" 
    });
  }
  if (!fullName || !phone || !email || !guestCount) {
    return res.status(400).json({ 
      error: true, 
      message: "Vui lòng điền đầy đủ họ tên, SĐT, email và số khách!" 
    });
  }

  // 2. Validate SĐT (Định dạng Việt Nam 10 chữ số)
  const phoneRegex = /(84|0[3|5|7|8|9])+([0-9]{8})\b/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ 
      error: true, 
      message: "Số điện thoại không hợp lệ (Phải là SĐT Việt Nam 10 chữ số)!" 
    });
  }

  // 3. Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      error: true, 
      message: "Định dạng Email không hợp lệ!" 
    });
  }

  // 4. Chống spam: Giới hạn tối đa 5 lượt đặt từ 1 địa chỉ IP trong 1 giờ (AC 4)
  const now = Date.now();
  if (!bookingLogs[userIp]) bookingLogs[userIp] = [];
  // Lọc giữ lại các lượt đặt trong vòng 1 giờ qua (3600000ms)
  bookingLogs[userIp] = bookingLogs[userIp].filter(time => now - time < 3600000);

  if (bookingLogs[userIp].length >= 5) {
    return res.status(429).json({ 
      error: true, 
      message: "Bạn đã vượt quá giới hạn tối đa 5 lượt đặt phòng trong một giờ!" 
    });
  }

  // 5. Kiểm tra phòng bị người khác đặt mất trong lúc điền form (AC 5)
  if (roomId === 'ROOM_FULL') {
    return res.status(409).json({
      error: true,
      message: "Khoảng ngày vừa bị người khác đặt mất trong lúc điền biểu mẫu!",
      keepData: true // Cờ để Frontend giữ lại thông tin đã nhập
    });
  }

  // Ghi nhận lượt đặt phòng thành công
  bookingLogs[userIp].push(now);

  // 6. Sinh mã booking 8 ký tự duy nhất (AC 3)
  const bookingCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  // 7. Tạo hạn giữ chỗ 24 giờ (AC 3)
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000);

  res.status(201).json({
    success: true,
    message: "Gửi yêu cầu đặt phòng thành công!",
    booking: {
      bookingCode,                 // Mã booking 8 ký tự duy nhất
      status: "Chờ xác nhận",     // Trạng thái ban đầu
      expiresAt,                   // Hạn giữ chỗ 24h
      customerInfo: { fullName, phone, email, guestCount, note }
    }
  });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});