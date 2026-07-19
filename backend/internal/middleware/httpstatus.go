package middleware

import (
	"sync/atomic"

	"github.com/gofiber/fiber/v3"
)

// Bộ đếm mã trạng thái HTTP toàn cục (in-memory) cho dashboard giám sát vận hành.
// Reset khi restart server — phản ánh lưu lượng kể từ lần khởi động gần nhất.
var (
	httpCount2xx   uint64
	httpCount4xx   uint64
	httpCount5xx   uint64
	httpCountOther uint64
)

// HTTPStatusCounter đếm phản hồi theo lớp mã trạng thái (2xx/4xx/5xx). Đặt sớm
// trong chuỗi middleware để bao trùm mọi request.
func HTTPStatusCounter() fiber.Handler {
	return func(c fiber.Ctx) error {
		err := c.Next()
		status := c.Response().StatusCode()
		switch {
		case status >= 200 && status < 300:
			atomic.AddUint64(&httpCount2xx, 1)
		case status >= 400 && status < 500:
			atomic.AddUint64(&httpCount4xx, 1)
		case status >= 500:
			atomic.AddUint64(&httpCount5xx, 1)
		default:
			atomic.AddUint64(&httpCountOther, 1)
		}
		return err
	}
}

// HTTPStatusSnapshot là ảnh chụp bộ đếm.
type HTTPStatusSnapshot struct {
	Count2xx uint64 `json:"count2xx"`
	Count4xx uint64 `json:"count4xx"`
	Count5xx uint64 `json:"count5xx"`
	Other    uint64 `json:"other"`
	Total    uint64 `json:"total"`
}

// HTTPStatusCounters trả về số đếm hiện tại.
func HTTPStatusCounters() HTTPStatusSnapshot {
	c2 := atomic.LoadUint64(&httpCount2xx)
	c4 := atomic.LoadUint64(&httpCount4xx)
	c5 := atomic.LoadUint64(&httpCount5xx)
	other := atomic.LoadUint64(&httpCountOther)
	return HTTPStatusSnapshot{
		Count2xx: c2, Count4xx: c4, Count5xx: c5, Other: other,
		Total: c2 + c4 + c5 + other,
	}
}
