package handler

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"backend/internal/model"
)

type StudentMgmtHandler struct {
	db *gorm.DB
}

func NewStudentMgmtHandler(db *gorm.DB) *StudentMgmtHandler {
	return &StudentMgmtHandler{db: db}
}

type CreateStudentRequest struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	Name            string `json:"name"`
	ClassroomID     string `json:"classroomId"`
	IsDemoQuickAdd  bool   `json:"isDemoQuickAdd"`
	PerformanceType string `json:"performanceType"` // "good", "poor", "average", "random", "custom"
	Subject         string `json:"subject"`
	TotalAnswers    int    `json:"totalAnswers"`
	CorrectAnswers  int    `json:"correctAnswers"`
	CurrentNodeID   string `json:"currentNodeId"`
}

type BulkImportRequest struct {
	ClassroomID string                 `json:"classroomId"`
	Students    []CreateStudentRequest `json:"students"`
}

type UpdateStudentRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// Helper to verify if the classroom belongs to the teacher
func (h *StudentMgmtHandler) verifyClassroomOwner(teacherID uuid.UUID, classroomID uuid.UUID) bool {
	var count int64
	h.db.Model(&model.Classroom{}).Where("id = ? AND teacher_id = ?", classroomID, teacherID).Count(&count)
	return count > 0
}

// Helper to verify if the student belongs to any classroom of this teacher
func (h *StudentMgmtHandler) verifyStudentOwner(teacherID uuid.UUID, studentID uuid.UUID) (uuid.UUID, error) {
	var student model.User
	if err := h.db.First(&student, "id = ? AND role = ?", studentID, "student").Error; err != nil {
		return uuid.Nil, errors.New("không tìm thấy học sinh")
	}

	if student.ClassroomID == nil {
		return uuid.Nil, errors.New("học sinh chưa được phân lớp")
	}

	if !h.verifyClassroomOwner(teacherID, *student.ClassroomID) {
		return uuid.Nil, errors.New("bạn không có quyền quản lý học sinh này")
	}

	return *student.ClassroomID, nil
}

// ──────────────────────────────────────────────────────────────────────
// CLASSROOMS (FOR TEACHER)
// ──────────────────────────────────────────────────────────────────────

func (h *StudentMgmtHandler) GetTeacherClassrooms(c fiber.Ctx) error {
	teacherIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	teacherID := uuid.MustParse(teacherIDStr)

	var classrooms []model.Classroom
	if err := h.db.Where("teacher_id = ?", teacherID).Order("name asc").Find(&classrooms).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể lấy danh sách lớp học: " + err.Error()})
	}

	return c.JSON(classrooms)
}

func (h *StudentMgmtHandler) GetClassroomStudents(c fiber.Ctx) error {
	teacherIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	teacherID := uuid.MustParse(teacherIDStr)

	classIDStr := c.Params("classId")
	classID, err := uuid.Parse(classIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID Lớp học không hợp lệ"})
	}

	if !h.verifyClassroomOwner(teacherID, classID) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bạn không có quyền xem lớp học này"})
	}

	var students []model.User
	if err := h.db.Where("role = ? AND classroom_id = ?", "student", classID).Order("name asc").Find(&students).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể lấy danh sách học sinh: " + err.Error()})
	}

	return c.JSON(students)
}

// ──────────────────────────────────────────────────────────────────────
// STUDENT CRUD (FOR TEACHER)
// ──────────────────────────────────────────────────────────────────────

func (h *StudentMgmtHandler) CreateStudent(c fiber.Ctx) error {
	teacherIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	teacherID := uuid.MustParse(teacherIDStr)

	var req CreateStudentRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	classID, err := uuid.Parse(req.ClassroomID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID Lớp học không hợp lệ"})
	}

	if !h.verifyClassroomOwner(teacherID, classID) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bạn không có quyền thêm học sinh vào lớp này"})
	}

	if req.Email == "" || len(req.Password) < 6 || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Thông tin không hợp lệ. Mật khẩu phải từ 6 ký tự"})
	}

	var count int64
	h.db.Model(&model.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email học sinh đã tồn tại trên hệ thống"})
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi mã hóa mật khẩu"})
	}

	student := model.User{
		ID:          uuid.New(),
		Email:       req.Email,
		Password:    string(hashedPassword),
		Name:        req.Name,
		Role:        "student",
		Status:      "active",
		ClassroomID: &classID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := h.db.Create(&student).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tạo tài khoản học sinh: " + err.Error()})
	}

	if req.IsDemoQuickAdd && req.Subject != "" {
		var total, correct int
		switch req.PerformanceType {
		case "good":
			total = 15
			correct = 13
		case "poor":
			total = 12
			correct = 3
		case "average":
			total = 10
			correct = 6
		case "random":
			seed := time.Now().UnixNano()
			total = int(seed%16) + 5 // 5 to 20
			correct = int(seed % int64(total+1))
		case "custom":
			total = req.TotalAnswers
			correct = req.CorrectAnswers
		default:
			total = 10
			correct = 6
		}

		if correct > total {
			correct = total
		}

		var nodeID uuid.UUID
		if req.CurrentNodeID != "" {
			nodeID, _ = uuid.Parse(req.CurrentNodeID)
		} else {
			var node model.Node
			if err := h.db.Where("subject = ?", req.Subject).First(&node).Error; err == nil {
				nodeID = node.ID
			} else {
				nodeID = uuid.Nil
			}
		}

		state := model.StudentState{
			ID:                 uuid.New(),
			StudentID:          student.ID,
			Subject:            req.Subject,
			InitialLevelNodeID: nodeID,
			CurrentLevelNodeID: nodeID,
			NeedsDiagnostic:    false,
			CreatedAt:          time.Now(),
			UpdatedAt:          time.Now(),
		}
		h.db.Create(&state)

		for i := 0; i < total; i++ {
			action := "answer_incorrect"
			if i < correct {
				action = "answer_correct"
			}
			logEntry := model.ActivityLog{
				ID:        uuid.New(),
				StudentID: student.ID,
				Subject:   req.Subject,
				NodeID:    nodeID,
				Action:    action,
				Detail:    "Mô phỏng trả lời câu hỏi chế độ Demo",
				CreatedAt: time.Now().Add(time.Duration(-total+i) * time.Minute),
			}
			h.db.Create(&logEntry)
		}
	}

	return c.Status(fiber.StatusCreated).JSON(student)
}

func (h *StudentMgmtHandler) CreateStudentsBulk(c fiber.Ctx) error {
	teacherIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	teacherID := uuid.MustParse(teacherIDStr)

	var req BulkImportRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	classID, err := uuid.Parse(req.ClassroomID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID Lớp học không hợp lệ"})
	}

	if !h.verifyClassroomOwner(teacherID, classID) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bạn không có quyền thêm học sinh vào lớp này"})
	}

	successCount := 0
	for _, stud := range req.Students {
		if stud.Email == "" || len(stud.Password) < 6 || stud.Name == "" {
			continue
		}

		var count int64
		h.db.Model(&model.User{}).Where("email = ?", stud.Email).Count(&count)
		if count > 0 {
			continue
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(stud.Password), bcrypt.DefaultCost)
		if err != nil {
			continue
		}

		student := model.User{
			ID:          uuid.New(),
			Email:       stud.Email,
			Password:    string(hashedPassword),
			Name:        stud.Name,
			Role:        "student",
			Status:      "active",
			ClassroomID: &classID,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		if err := h.db.Create(&student).Error; err == nil {
			successCount++
		}
	}

	return c.JSON(fiber.Map{"message": "Đã nhập thành công danh sách học sinh", "successCount": successCount})
}

func (h *StudentMgmtHandler) UpdateStudent(c fiber.Ctx) error {
	teacherIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	teacherID := uuid.MustParse(teacherIDStr)

	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID không hợp lệ"})
	}

	var req UpdateStudentRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	_, err = h.verifyStudentOwner(teacherID, id)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}

	var student model.User
	h.db.First(&student, "id = ?", id)

	if req.Name != "" {
		student.Name = req.Name
	}
	if req.Email != "" {
		student.Email = req.Email
	}
	student.UpdatedAt = time.Now()

	if err := h.db.Save(&student).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể cập nhật học sinh: " + err.Error()})
	}

	return c.JSON(student)
}

func (h *StudentMgmtHandler) ResetStudentPassword(c fiber.Ctx) error {
	teacherIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	teacherID := uuid.MustParse(teacherIDStr)

	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID không hợp lệ"})
	}

	_, err = h.verifyStudentOwner(teacherID, id)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}

	var student model.User
	h.db.First(&student, "id = ?", id)

	defaultPwd := "123456"
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(defaultPwd), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi mã hóa mật khẩu"})
	}

	student.Password = string(hashedPassword)
	student.UpdatedAt = time.Now()

	if err := h.db.Save(&student).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể đặt lại mật khẩu: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Đã đặt lại mật khẩu học sinh thành '123456'"})
}

func (h *StudentMgmtHandler) DeleteStudent(c fiber.Ctx) error {
	teacherIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	teacherID := uuid.MustParse(teacherIDStr)

	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID không hợp lệ"})
	}

	_, err = h.verifyStudentOwner(teacherID, id)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}

	// Delete chat sessions, messages, states, and the user
	h.db.Exec("DELETE FROM messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE student_id = ?)", id)
	h.db.Exec("DELETE FROM chat_sessions WHERE student_id = ?", id)
	h.db.Exec("DELETE FROM student_states WHERE student_id = ?", id)
	h.db.Exec("DELETE FROM activity_logs WHERE student_id = ?", id)
	h.db.Exec("DELETE FROM learning_paths WHERE student_id = ?", id)
	h.db.Exec("DELETE FROM guardrail_events WHERE student_id = ?", id)

	if err := h.db.Delete(&model.User{}, "id = ?", id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể xóa học sinh: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Đã xóa tài khoản học sinh thành công"})
}
