// Package aicost đếm token và ước tính chi phí gọi LLM (Gemini) tích luỹ trong bộ nhớ,
// phục vụ Tầng 3 (AI Cost Control) của dashboard giám sát admin.
//
// Lưu ý: đây là bộ đếm in-memory (reset khi restart server) — đủ cho demo/ops realtime.
// Muốn bền vững qua restart cần một bảng DB riêng.
package aicost

import "sync"

// Đơn giá gemini-2.5-flash (USD trên 1 triệu token). Xấp xỉ theo bảng giá công bố;
// chỉnh qua các hằng số này nếu đổi model/đơn giá.
const (
	pricePerMInputUSD  = 0.30
	pricePerMOutputUSD = 2.50
	usdToVND           = 25000.0
	monthlyQuotaUSD    = 50.0 // ngưỡng quota tháng để tính % còn lại + circuit breaker
	Model              = "gemini-2.5-flash"
)

var (
	mu           sync.Mutex
	inputTokens  int64
	outputTokens int64
	requestCount int64
)

// Record cộng dồn token của một lần gọi LLM.
func Record(input, output int) {
	if input < 0 {
		input = 0
	}
	if output < 0 {
		output = 0
	}
	mu.Lock()
	inputTokens += int64(input)
	outputTokens += int64(output)
	requestCount++
	mu.Unlock()
}

// Snapshot là ảnh chụp chi phí tích luỹ.
type Snapshot struct {
	Model             string  `json:"model"`
	InputTokens       int64   `json:"inputTokens"`
	OutputTokens      int64   `json:"outputTokens"`
	TotalTokens       int64   `json:"totalTokens"`
	RequestCount      int64   `json:"requestCount"`
	USD               float64 `json:"usd"`
	VND               float64 `json:"vnd"`
	MonthlyQuotaUSD   float64 `json:"monthlyQuotaUsd"`
	QuotaRemainingPct float64 `json:"quotaRemainingPct"`
	CircuitBreakerOn  bool    `json:"circuitBreakerOn"` // true khi vượt ngưỡng quota
}

// Current trả chi phí hiện tại.
func Current() Snapshot {
	mu.Lock()
	in, out, reqs := inputTokens, outputTokens, requestCount
	mu.Unlock()

	usd := float64(in)/1e6*pricePerMInputUSD + float64(out)/1e6*pricePerMOutputUSD
	remaining := (1 - usd/monthlyQuotaUSD) * 100
	if remaining < 0 {
		remaining = 0
	}
	return Snapshot{
		Model:             Model,
		InputTokens:       in,
		OutputTokens:      out,
		TotalTokens:       in + out,
		RequestCount:      reqs,
		USD:               usd,
		VND:               usd * usdToVND,
		MonthlyQuotaUSD:   monthlyQuotaUSD,
		QuotaRemainingPct: remaining,
		CircuitBreakerOn:  usd >= monthlyQuotaUSD,
	}
}
