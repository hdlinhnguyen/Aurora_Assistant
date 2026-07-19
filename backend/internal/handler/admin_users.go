package handler

import (
	"regexp"
	"sort"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"backend/internal/model"
)

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// GetUsersDiagnostics trả bảng "Users & Diagnostics": mỗi học sinh kèm điểm trung bình
// (từ BKT mastery), độ rõ Feynman, lỗ hổng lớn nhất và trạng thái — cho /admin/users.
func (h *AdminHandler) GetUsersDiagnostics(c fiber.Ctx) error {
	var students []model.User
	if err := h.db.Where("role = ?", "student").Order("name asc").Find(&students).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải danh sách học sinh"})
	}

	// Điểm trung bình (0..1) theo học sinh từ BKT.
	type aggRow struct {
		StudentID uuid.UUID
		Avg       float64
	}
	avgByStudent := map[uuid.UUID]float64{}
	{
		var rows []aggRow
		h.db.Raw(`SELECT student_id, AVG(mastery_probability) AS avg FROM student_topic_masteries GROUP BY student_id`).Scan(&rows)
		for _, r := range rows {
			avgByStudent[r.StudentID] = r.Avg
		}
	}

	// Độ rõ Feynman trung bình (0..100) theo học sinh.
	clarityByStudent := map[uuid.UUID]float64{}
	{
		var rows []aggRow
		h.db.Raw(`
			SELECT cs.student_id AS student_id, AVG(m.feynman_score) AS avg
			FROM messages m JOIN chat_sessions cs ON cs.id = m.session_id
			WHERE cs.mode = 'feynman' AND m.feynman_score > 0
			GROUP BY cs.student_id`).Scan(&rows)
		for _, r := range rows {
			clarityByStudent[r.StudentID] = r.Avg
		}
	}

	// Lỗ hổng lớn nhất (mastery thấp nhất) theo học sinh + tên node.
	type gapRow struct {
		StudentID uuid.UUID
		TopicID   uuid.UUID
		Mastery   float64
	}
	topGapByStudent := map[uuid.UUID]gapRow{}
	{
		var rows []gapRow
		h.db.Raw(`
			SELECT DISTINCT ON (student_id) student_id, topic_id, mastery_probability AS mastery
			FROM student_topic_masteries
			ORDER BY student_id, mastery_probability ASC`).Scan(&rows)
		for _, r := range rows {
			topGapByStudent[r.StudentID] = r
		}
	}
	nodeName := map[uuid.UUID]string{}
	{
		var nodes []model.Node
		h.db.Select("id", "name").Find(&nodes)
		for _, n := range nodes {
			nodeName[n.ID] = n.Name
		}
	}

	statusOf := func(hasData bool, avg10 float64) string {
		if !hasData {
			return "at_risk"
		}
		switch {
		case avg10 >= 8:
			return "mastery"
		case avg10 >= 5:
			return "progressing"
		case avg10 >= 3:
			return "at_risk"
		default:
			return "critical_gap"
		}
	}

	type userRow struct {
		ID              string   `json:"id"`
		Name            string   `json:"name"`
		Email           string   `json:"email"`
		AvgScore        *float64 `json:"avgScore"`
		Clarity         *float64 `json:"clarity"`
		TopGap          *string  `json:"topGap"`
		TopGapSeverity  *float64 `json:"topGapSeverity"`
		ClassID         *string  `json:"classId"`
		Status          string   `json:"status"`
		Invalid         bool     `json:"invalid,omitempty"`
		ValidationError string   `json:"validationError,omitempty"`
	}

	rows := make([]userRow, 0, len(students))
	for _, s := range students {
		row := userRow{ID: s.ID.String(), Name: s.Name, Email: s.Email, Status: "at_risk"}
		if s.ClassroomID != nil {
			cid := s.ClassroomID.String()
			row.ClassID = &cid
		}
		hasMastery := false
		if avg, ok := avgByStudent[s.ID]; ok {
			hasMastery = true
			score := avg * 10
			row.AvgScore = &score
		}
		if cl, ok := clarityByStudent[s.ID]; ok {
			row.Clarity = &cl
		}
		if g, ok := topGapByStudent[s.ID]; ok {
			if name := nodeName[g.TopicID]; name != "" {
				row.TopGap = &name
				sev := (1 - g.Mastery) * 100
				row.TopGapSeverity = &sev
			}
		}
		avg10 := 0.0
		if row.AvgScore != nil {
			avg10 = *row.AvgScore
		}
		row.Status = statusOf(hasMastery, avg10)
		// Cờ chất lượng dữ liệu: email sai định dạng.
		if !emailRe.MatchString(s.Email) {
			row.Invalid = true
			row.ValidationError = "Email không đúng định dạng"
		}
		rows = append(rows, row)
	}

	return c.JSON(fiber.Map{"users": rows})
}

var leadingDigits = regexp.MustCompile(`\d+`)

// GetClassTree trả cây Trường → Khối → Lớp (khối suy từ chữ số trong tên lớp), kèm sĩ số.
func (h *AdminHandler) GetClassTree(c fiber.Ctx) error {
	var classrooms []model.Classroom
	if err := h.db.Order("name asc").Find(&classrooms).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải lớp học"})
	}

	// Sĩ số theo lớp.
	type countRow struct {
		ClassroomID uuid.UUID
		Cnt         int
	}
	countByClass := map[uuid.UUID]int{}
	{
		var rows []countRow
		h.db.Raw(`SELECT classroom_id, COUNT(*) AS cnt FROM users WHERE role='student' AND classroom_id IS NOT NULL AND deleted_at IS NULL GROUP BY classroom_id`).Scan(&rows)
		for _, r := range rows {
			countByClass[r.ClassroomID] = r.Cnt
		}
	}

	type classNode struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	type khoiNode struct {
		ID      string      `json:"id"`
		Name    string      `json:"name"`
		Total   int         `json:"total"`
		Classes []classNode `json:"classes"`
	}

	khoiMap := map[string]*khoiNode{}
	for _, cls := range classrooms {
		khoi := "Khác"
		if m := leadingDigits.FindString(cls.Name); m != "" {
			khoi = m
		}
		k, ok := khoiMap[khoi]
		if !ok {
			k = &khoiNode{ID: "khoi-" + khoi, Name: "Khối " + khoi, Classes: []classNode{}}
			khoiMap[khoi] = k
		}
		cnt := countByClass[cls.ID]
		k.Total += cnt
		k.Classes = append(k.Classes, classNode{ID: cls.ID.String(), Name: cls.Name, Count: cnt})
	}

	khois := make([]*khoiNode, 0, len(khoiMap))
	for _, k := range khoiMap {
		khois = append(khois, k)
	}
	sort.Slice(khois, func(i, j int) bool { return khois[i].Name < khois[j].Name })

	return c.JSON(fiber.Map{"school": "Toàn trường", "khoi": khois})
}

type assignClassRequest struct {
	ClassroomID *string `json:"classroomId"` // null = gỡ khỏi lớp
}

// AssignStudentClass gán học sinh vào một lớp (mô hình 1 học sinh - 1 lớp theo classroom_id).
func (h *AdminHandler) AssignStudentClass(c fiber.Ctx) error {
	studentID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID học sinh không hợp lệ"})
	}
	var req assignClassRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	var student model.User
	if err := h.db.First(&student, "id = ? AND role = ?", studentID, "student").Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Không tìm thấy học sinh"})
	}

	var classroomID *uuid.UUID
	if req.ClassroomID != nil && strings.TrimSpace(*req.ClassroomID) != "" {
		cid, err := uuid.Parse(*req.ClassroomID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID lớp không hợp lệ"})
		}
		var count int64
		h.db.Model(&model.Classroom{}).Where("id = ?", cid).Count(&count)
		if count == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Lớp không tồn tại"})
		}
		classroomID = &cid
	}

	if err := h.db.Model(&student).Update("classroom_id", classroomID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể gán lớp: " + err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "studentId": studentID.String(), "classroomId": req.ClassroomID})
}
